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
  V3,
  vec3ToV3,
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

type PosAndEdge = { pos: vec3; edge: number[] };

export function roundedCubeData(side = 1, rPercent = 0.25): [V3[], V3[]] {
  if (rPercent < 0.01) {
    rPercent = 0;
  }
  if (rPercent > 0.99) {
    rPercent = 1;
  }

  const rounded = rPercent > 0;
  const sphere = rPercent == 1;

  const subdivisions = rPercent > 0.85 ? 4 : 3;
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

  const positions: PosAndEdge[] = [
    { pos: vec3.sub(vec3.create(), A0, center), edge: [0, 2] },
    { pos: vec3.sub(vec3.create(), B0, center), edge: [1, 0] },
    { pos: vec3.sub(vec3.create(), C0, center), edge: [2, 1] },
  ];
  const indices: V3[] = [];

  const edgeIndices: [[number, number][], [number, number][], [number, number][]] = [[], [], []];

  const storeEdgeP = (p: PosAndEdge, i: number) => {
    for (let edgeI of p.edge) {
      edgeIndices[edgeI].push([vec3.distance(p.pos, positions[edgeI].pos), i]);
    }
  };
  positions.forEach(storeEdgeP);

  const getTopPos = (p: vec3): V3 => [p[0] + center[0], p[1] + center[0], p[2] + center[0]];
  const getBottomPos = (p: vec3): V3 => [p[2], -p[1], p[0]];

  const rotate90Pos = (p: vec3): V3 => [p[2], p[1], -p[0]];
  const rotate180Pos = (p: vec3): V3 => [-p[0], p[1], -p[2]];
  const rotate270Pos = (p: vec3): V3 => [-p[2], p[1], p[0]];

  const positionsTransformed: [V3[], V3[], V3[], V3[], V3[], V3[], V3[], V3[]] = [[], [], [], [], [], [], [], []];

  const addTransformedPositions = (pos: PosAndEdge) => {
    const top = getTopPos(pos.pos);
    const bot = getBottomPos(top);
    const [top1, top2, top3] = [rotate90Pos(top), rotate180Pos(top), rotate270Pos(top)];
    const [bot1, bot2, bot3] = [rotate90Pos(bot), rotate180Pos(bot), rotate270Pos(bot)];
    [top, bot, top1, bot1, top2, bot2, top3, bot3].forEach((pos, i) => positionsTransformed[i].push(pos));
  };
  positions.forEach(addTransformedPositions);

  const midpoints: { [key: string]: number } = {};

  const midpoint = (p1: PosAndEdge, p2: PosAndEdge): PosAndEdge => ({
    pos: vec3.lerp(vec3.create(), p1.pos, p2.pos, 0.5),
    edge: arrayIntersect(p1.edge, p2.edge),
  });
  const cachedMidpoint = (i1: number, i2: number) => {
    const key = sortNum([i1, i2]).join("-");
    if (!midpoints[key]) {
      const midP = midpoint(positions[i1], positions[i2]);
      const midI = positions.length;
      storeEdgeP(midP, midI);
      vec3.scale(midP.pos, midP.pos, r / vec3.length(midP.pos)); // normalize to rounded corner sphere radius
      positions.push(midP);
      addTransformedPositions(midP);
      midpoints[key] = midI;
    }
    return midpoints[key];
  };

  const subdivideTriangle = (iA: number, iB: number, iC: number, level: number) => {
    const iD = cachedMidpoint(iA, iB);
    const iE = cachedMidpoint(iB, iC);
    const iF = cachedMidpoint(iC, iA);

    const triangles = [
      [iA, iD, iF],
      [iD, iB, iE],
      [iF, iE, iC],
      [iD, iE, iF],
    ];

    for (let [i1, i2, i3] of triangles) {
      if (level == subdivisions) {
        indices.push([i1, i2, i3]);
      } else {
        subdivideTriangle(i1, i2, i3, level + 1);
      }
    }
  };

  rounded && subdivideTriangle(0, 1, 2, 1);

  // get positions and indices for all corner triangles
  const getIndex = (i: number, batch: number) => i + batch * positions.length;
  const allPositions: V3[] = [...positionsTransformed].flat();
  const allIndices: V3[] = Array.from(Array(8))
    .map((_, batch): V3[] => indices.map((t) => [getIndex(t[0], batch), getIndex(t[1], batch), getIndex(t[2], batch)]))
    .flat();

  const flat = [];

  if (!sphere) {
    edgeIndices.forEach((edge) => edge.sort((a, b) => a[0] - b[0]));
    const [edge0Points_, edge1Points_, edge2Points_] = edgeIndices;
    const edge0PointsR = [...edge0Points_].reverse();
    const edge1PointsR = [...edge1Points_].reverse();
    const edge2PointsR = [...edge2Points_].reverse();

    const tops = [];
    const bots = [];

    for (let turn of [0, 1, 2, 3]) {
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

        allIndices.push(...indexRowsToTriangles(verticalEdgePoints1, verticalEdgePoints2));
        allIndices.push(...indexRowsToTriangles(horizEdgeTopPoints1, horizEdgeTopPoints2));
        allIndices.push(...indexRowsToTriangles(horizEdgeBotPoints1, horizEdgeBotPoints2));
      }

      flat.push(
        ...indexRowsToTriangles([getIndex(1, top0), getIndex(0, top1)], [getIndex(0, bot0), getIndex(1, bot1)])
      );
    }
    flat.push(...indexRowsToTriangles([tops[3], tops[2]], [tops[0], tops[1]]));
    flat.push(...indexRowsToTriangles([bots[0], bots[1]], [bots[3], bots[2]]));
    allIndices.push(...flat);
  }

  // return convertToFacePositions(allPositions, allIndices);
  return [allPositions, allIndices];
}
