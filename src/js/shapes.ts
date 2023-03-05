import { vec3 } from "gl-matrix";
import {
  arrayIntersect,
  arrayRange,
  clamp,
  convertToFacePositions,
  indexCircleToTriangles,
  indexRingToTriangles,
  indexRowsToTriangles,
  indexSectorToTriangles,
  mR,
  rad,
  sortNum,
  subdivideIndexRows,
  V3,
  vec3ToV3,
  zip,
} from "./utils";

// prettier-ignore
export const squareData = (side = 1, z = 0): [V3[], V3[]] => {
  const s = side / 2;
  const vertices: V3[] = [
    [-s, -s, z],
    [ s, -s, z],
    [ s,  s, z],
    [-s,  s, z],
  ]
  const indices: V3[] = [
    [0, 1, 2],    [0, 2, 3],
  ]
  return [vertices, indices];
};

function roundedSquarePositions(side: number, z: number, rPercent: number, noCenter = false): V3[] {
  if (rPercent > 0.99) {
    rPercent = 1;
  }

  const isCircle = rPercent == 1;

  const subdivisions = clamp(mR(rPercent * 20), 4, 16);
  const s = side / 2;
  const r = rPercent * s;
  const R = isCircle ? 0 : s - r;

  const center: V3 = [0, 0, 0];
  const v: V3 = [r, 0, 0];

  const rotate90 = (p: vec3): V3 => [-p[1], p[0], p[2]];
  const quadrantSubs = () =>
    Array.from({ length: subdivisions - 1 }, (_, i) =>
      vec3ToV3(vec3.rotateZ(vec3.create(), v, center, rad((i + 1) * (90 / subdivisions))))
    );

  const quadrant0 = isCircle
    ? [v, ...quadrantSubs()]
    : noCenter
    ? [v, ...quadrantSubs(), rotate90(v)]
    : [center, v, ...quadrantSubs(), rotate90(v)];
  const quadrant1 = quadrant0.map(rotate90);
  const quadrant2 = quadrant1.map(rotate90);
  const quadrant3 = quadrant2.map(rotate90);

  isCircle && !noCenter && quadrant0.unshift(center);

  // prettier-ignore
  const corners: V3[] = [
    [ R,  R,  z],
    [-R,  R,  z],
    [-R, -R,  z],
    [ R, -R,  z],
  ];

  const cornerTranslate = (allP: V3[], c: vec3) => {
    for (let p of allP) {
      p[0] += c[0];
      p[1] += c[1];
      p[2] += c[2];
    }
  };

  cornerTranslate(quadrant0, corners[0]);
  cornerTranslate(quadrant1, corners[1]);
  cornerTranslate(quadrant2, corners[2]);
  cornerTranslate(quadrant3, corners[3]);

  return [...quadrant0, ...quadrant1, ...quadrant2, ...quadrant3];
}

export function extrudedRingData(
  side: number,
  z: number,
  rPercent: number,
  wPercent: number,
  extrude: number
): [V3[], V3[]] {
  const eps = 0.001;

  const top = roundedRingData(side, z + Math.max(extrude, eps), rPercent, wPercent);

  if (extrude <= eps) {
    return top;
  }

  const [positions, indices] = top;

  const ring = !(wPercent > 0.99);
  const circle = rPercent > 0.99;
  const square = rPercent < 0.01;

  const posLen = positions.length;

  // if not ring and not square then filter out center positions
  const upperPos = positions
    .filter((_, i) => ring || square || (circle ? i : i % (posLen / 4)))
    .map((p): V3 => [p[0], p[1], p[2]]);
  const lowerPos = upperPos.map((p): V3 => [p[0], p[1], z]);

  const newPosLen = upperPos.length;
  const ringLen = newPosLen / (ring ? 2 : 1);
  const cutoff = ring ? posLen / 2 : 0;
  const indexRange = (len: number, start = 0) => arrayRange(len, posLen + start);

  const innerI = ring ? indexRingToTriangles(indexRange(ringLen, newPosLen), indexRange(ringLen)) : [];
  const outerI = indexRingToTriangles(indexRange(ringLen, cutoff), indexRange(ringLen, newPosLen + cutoff));

  const allPositions = [...positions, ...upperPos, ...lowerPos];
  const allIndices = [...indices, ...innerI, ...outerI];

  return square ? convertToFacePositions(allPositions, allIndices) : [allPositions, allIndices];
}

export function roundedRingData(side: number, z: number, rPercent: number, wPercent: number): [V3[], V3[]] {
  if (wPercent > 0.99) {
    return roundedSquareData(side, z, rPercent);
  }
  if (wPercent < 0.01) {
    wPercent = 0.01;
  }
  const innerSide = (1 - wPercent) * side;
  const square = rPercent < 0.01;

  const posInner = square ? squareData(innerSide, z)[0] : roundedSquarePositions(innerSide, z, rPercent, true);
  const posOuter = square ? squareData(side, z)[0] : roundedSquarePositions(side, z, rPercent, true);

  const posLen = posInner.length;

  return [[...posInner, ...posOuter], indexRingToTriangles(arrayRange(posLen), arrayRange(posLen, posLen))];
}

export function roundedSquareData(side = 1, z = 0, rPercent = 0.25): [V3[], V3[]] {
  if (rPercent < 0.01) {
    return squareData(side, z);
  }
  if (rPercent > 0.99) {
    rPercent = 1;
  }

  const isCircle = rPercent == 1;

  const allPositions = roundedSquarePositions(side, z, rPercent);

  if (isCircle) {
    const allIndices = indexCircleToTriangles(arrayRange(allPositions.length));
    return [allPositions, allIndices];
  }

  const allIndices: V3[] = [];
  const qLen = allPositions.length / 4;

  const getIndices = (batch: number) => Array.from({ length: qLen }, (_, i) => i + batch * qLen);

  const indicesBatches = [getIndices(0), getIndices(1), getIndices(2), getIndices(3)];

  const nextBatchPoints = (batch: number) => {
    const nextBatch = indicesBatches[(batch + 1) % indicesBatches.length];
    return [nextBatch[0], nextBatch[1]];
  };

  indicesBatches.forEach((indicesBatch, i) => {
    allIndices.push(...indexSectorToTriangles(indicesBatch));

    const [curr0, currLast] = [indicesBatch[0], indicesBatch[indicesBatch.length - 1]];
    const [next0, next1] = nextBatchPoints(i);

    const row1 = [next1, currLast];
    const row2 = [next0, curr0];
    allIndices.push(...indexRowsToTriangles(row1, row2));
  });

  allIndices.push(
    ...indexRowsToTriangles([indicesBatches[1][0], indicesBatches[0][0]], [indicesBatches[2][0], indicesBatches[3][0]])
  );

  return [allPositions, allIndices];
}

// prettier-ignore
export const cubeData = (side=1): [V3[], V3[]] => {
  const s = side / 2;
  const vertices: V3[] = [
    [-s, -s,  s],  [ s, -s,  s],   [s,  s,  s],  [-s,  s,  s],
    [-s, -s, -s],  [-s,  s, -s],   [s,  s, -s],  [ s, -s, -s],
  ];
  const indices: V3[] = [
    [0, 1, 2],    [0, 2, 3],
    [7, 4, 5],    [7, 5, 6],
    [3, 2, 6],    [3, 6, 5],
    [4, 7, 1],    [4, 1, 0],
    [1, 7, 6],    [1, 6, 2],
    [4, 0, 3],    [4, 3, 5],
  ]
  return [vertices, indices];
};

export function roundedCubeData(side = 1, rPercent = 0.25): [V3[], V3[]] {
  if (rPercent < 0.01) {
    rPercent = 0;
  }
  if (rPercent > 0.99) {
    rPercent = 1;
  }

  const rounded = rPercent > 0;
  const sphere = rPercent == 1;

  const subdivisions = Math.max(4, mR(rPercent * 20));
  const s = side / 2;
  const r = rPercent * s;

  // prettier-ignore
  const adjusted: vec3[] = [
      [s-r, s-r, s-r],
      [s-r, s-r, s  ],
      [s  , s-r, s-r],
      [s-r, s  , s-r],
    ];
  const [center, A0, B0, C0] = adjusted;

  const positions: vec3[] = [
    vec3.sub(vec3.create(), A0, center),
    vec3.sub(vec3.create(), B0, center),
    vec3.sub(vec3.create(), C0, center),
  ];
  const edges = [
    [0, 2],
    [1, 0],
    [2, 1],
  ];
  const indices: V3[] = [];

  const edgeIndices: [[number, number][], [number, number][], [number, number][]] = [[], [], []];

  const storeEdgeP = (p: vec3, edge: number[], i: number) => {
    if (sphere) return;
    for (let edgeI of edge) {
      edgeIndices[edgeI].push([vec3.distance(p, positions[edgeI]), i]);
    }
  };
  positions.forEach((p, i) => storeEdgeP(p, edges[i], i));

  const getTopPos = (p: vec3): V3 => [p[0] + center[0], p[1] + center[0], p[2] + center[0]];
  const getBottomPos = (p: vec3): V3 => [p[2], -p[1], p[0]];

  const rotate90Pos = (p: vec3): V3 => [p[2], p[1], -p[0]];
  const rotate180Pos = (p: vec3): V3 => [-p[0], p[1], -p[2]];
  const rotate270Pos = (p: vec3): V3 => [-p[2], p[1], p[0]];

  const positionsTransformed: [V3[], V3[], V3[], V3[], V3[], V3[], V3[], V3[]] = [[], [], [], [], [], [], [], []];

  const addTransformedPositions = (p: vec3) => {
    if (sphere) return;
    const top = getTopPos(p);
    const bot = getBottomPos(top);
    const [top1, top2, top3] = [rotate90Pos(top), rotate180Pos(top), rotate270Pos(top)];
    const [bot1, bot2, bot3] = [rotate90Pos(bot), rotate180Pos(bot), rotate270Pos(bot)];
    [top, bot, top1, bot1, top2, bot2, top3, bot3].forEach((pos, i) => positionsTransformed[i].push(pos));
  };
  positions.forEach(addTransformedPositions);

  const midpoints: { [key: string]: number[] } = {};

  const cachePoint = (p: vec3, edge: number[]) => {
    const i = positions.length;
    storeEdgeP(p, edge, i);
    vec3.scale(p, p, r / vec3.length(p)); // normalize to rounded corner sphere radius
    positions.push(p);
    edges.push(edge);
    addTransformedPositions(p);
    return i;
  };

  const cacheMidpoints = (i1: number, i2: number, points: number, rev = false) => {
    const key = sortNum([i1, i2]).join("-");
    if (!midpoints[key]) {
      const [p1, p2] = [positions[i1], positions[i2]];
      const [e1, e2] = [edges[i1], edges[i2]];
      const edge = arrayIntersect(e1, e2);
      midpoints[key] = Array.from({ length: points }, (_, i) =>
        cachePoint(vec3.lerp(vec3.create(), p1, p2, (i + 1) / (points + 1)), [...edge])
      );
    }
    return rev ? [...midpoints[key]].reverse() : [...midpoints[key]];
  };

  const subdivideTriangle = (iA: number, iB: number, iC: number, subs: number, rev = false) => {
    const edgeA = [...cacheMidpoints(iC, iA, subs - 1), iA];
    const edgeB = [...cacheMidpoints(iC, iB, subs - 1), iB];
    const rows = [[iC]];
    zip(edgeA, edgeB).forEach(([a, b], i) => {
      const midPs = cacheMidpoints(a, b, i, rev && i == edgeA.length - 1);
      rows.push([a, ...midPs, b]);
    });
    for (let i = 1; i < rows.length; i++) {
      const row1 = rows[i - 1];
      const row2 = rows[i];
      const j = row1.length - 1;
      indices.push(...indexRowsToTriangles(row1, row2, false, () => true), [row1[j], row2[j], row2[j + 1]]);
    }
  };

  if (sphere) {
    positions.push([0, 0, -s], [-s, 0, 0], [0, -s, 0]);

    subdivideTriangle(0, 1, 2, subdivisions);
    subdivideTriangle(1, 3, 2, subdivisions);
    subdivideTriangle(3, 4, 2, subdivisions);
    subdivideTriangle(4, 0, 2, subdivisions);

    subdivideTriangle(1, 0, 5, subdivisions, true);
    subdivideTriangle(3, 1, 5, subdivisions, true);
    subdivideTriangle(4, 3, 5, subdivisions, true);
    subdivideTriangle(0, 4, 5, subdivisions, true);

    const [allPositions, allIndices] = [positions.map((p) => vec3ToV3(p)), indices];
    // return convertToFacePositions(allPositions, allIndices);
    return [allPositions, allIndices];
  }

  rounded && subdivideTriangle(0, 1, 2, subdivisions);

  // get positions and indices for all corner triangles
  const getIndex = (i: number, batch: number) => i + batch * positions.length;
  const allPositions: V3[] = [...positionsTransformed].flat();
  const allIndices: V3[] = Array.from(Array(8))
    .map((_, batch): V3[] => indices.map((t) => [getIndex(t[0], batch), getIndex(t[1], batch), getIndex(t[2], batch)]))
    .flat();

  const flat: V3[] = [];

  edgeIndices.forEach((edge) => edge.sort((a, b) => a[0] - b[0]));
  const [edge0Points_, edge1Points_, edge2Points_] = edgeIndices;
  const edge0PointsR = [...edge0Points_].reverse();
  const edge1PointsR = [...edge1Points_].reverse();
  const edge2PointsR = [...edge2Points_].reverse();

  const tops = [];
  const bots = [];
  const faces: [number[][], number[][], number[][], number[][], number[][], number[][]] = [[], [], [], [], [], []];

  const subs = rounded ? Math.floor(0.001 + ((1 - rPercent) * 10) / 2) * 2 + 1 : 1;

  for (let turn of [0, 1, 2, 3]) {
    const prevTurn = turn ? turn - 1 : 3;
    const getBatch = (i: number) => (turn * 2 + i) % 8;
    const [top0, bot0, top1, bot1] = [getBatch(0), getBatch(1), getBatch(2), getBatch(3)];
    tops.push(getIndex(2, top0));
    bots.push(getIndex(2, bot0));

    if (rounded) {
      const verticalEdgePoints1 = edge0Points_.map(([_, i]) => getIndex(i, top0));
      const verticalEdgePoints2 = edge0PointsR.map(([_, i]) => getIndex(i, bot0));

      const horizEdgeTopPoints1 = edge1Points_.map(([_, i]) => getIndex(i, top0));
      const horizEdgeTopPoints2 = edge2PointsR.map(([_, i]) => getIndex(i, top1));

      const horizEdgeBotPoints1 = edge2Points_.map(([_, i]) => getIndex(i, bot0));
      const horizEdgeBotPoints2 = edge1PointsR.map(([_, i]) => getIndex(i, bot1));

      for (let [row1, row2, edge] of [
        [verticalEdgePoints1, verticalEdgePoints2, [1]],
        [horizEdgeTopPoints1, horizEdgeTopPoints2, [0]],
        [horizEdgeBotPoints1, horizEdgeBotPoints2, [2]],
      ]) {
        const [extraPositions, midEdgePoints] = subdivideIndexRows(row1, row2, subs, allPositions);
        allPositions.push(...extraPositions.flat());

        const pointsList = [row1, ...midEdgePoints, row2];
        pointsList.forEach((_, i) => {
          if (i) {
            allIndices.push(...indexRowsToTriangles(pointsList[i - 1], pointsList[i]));
          }
        });

        const edge0 = pointsList.map((l) => l[0]);
        const edge1 = pointsList.map((l) => l[l.length - 1]);

        edge[0] == 0 && (faces[turn][0] = edge0);
        edge[0] == 1 && (faces[turn][1] = edge1);
        edge[0] == 2 && (faces[turn][2] = edge1);

        edge[0] == 0 && (faces[4][turn] = turn == 0 || turn == 3 ? [...edge1].reverse() : edge1);
        edge[0] == 1 && (faces[prevTurn][3] = edge0);
        edge[0] == 2 && (faces[5][3 - turn] = turn == 1 || turn == 2 ? [...edge0].reverse() : edge0);
      }
    }

    if (!rounded) {
      flat.push(
        ...indexRowsToTriangles([getIndex(1, top0), getIndex(0, top1)], [getIndex(0, bot0), getIndex(1, bot1)])
      );
    }
  }

  if (rounded) {
    for (let face of faces) {
      const face0b = face[0].slice(1, face[0].length - 1);
      const face2b = face[2].slice(1, face[2].length - 1);
      const [extraPositions, midEdgePoints] = subdivideIndexRows(face0b, face2b, subs, allPositions);
      allPositions.push(...extraPositions.flat());
      const midRows = midEdgePoints.map((points, i) => [face[1][i + 1], ...points, face[3][i + 1]]);

      const pointsList = [face[0], ...midRows, face[2]];
      pointsList.forEach((_, i) => {
        if (i) {
          flat.push(...indexRowsToTriangles(pointsList[i - 1], pointsList[i]));
        }
      });
    }
  } else {
    flat.push(...indexRowsToTriangles([tops[3], tops[2]], [tops[0], tops[1]]));
    flat.push(...indexRowsToTriangles([bots[0], bots[1]], [bots[3], bots[2]]));
  }
  allIndices.push(...flat);

  // return convertToFacePositions(allPositions, allIndices);
  return [allPositions, allIndices];
}
