import { vec3 } from "gl-matrix";
import {
  arrayIntersect,
  arrayRange,
  arrayUniqueVals,
  clamp,
  convertToFacePositions,
  divmod,
  indexCircleToTriangles,
  indexRingToTriangles,
  indexRowsToTriangles,
  indexSectorToTriangles,
  mR,
  rad,
  sortNum,
  subdivideIndexRows,
  V2,
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

function roundedSquarePositions(
  side: number,
  z: number,
  rPercent: number,
  noCenter = false,
  subEdges?: number | number[]
): V3[] {
  if (rPercent > 0.99) {
    rPercent = 1;
  }
  if (rPercent < 0.01) {
    rPercent = 0;
  }

  const isCircle = rPercent == 1;
  const isSquare = rPercent == 0;

  const subdivisions = isSquare ? 0 : clamp(mR(rPercent * 20), 4, 16);
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
    : isSquare
    ? [center]
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

  if (subEdges) {
    [quadrant0, quadrant1, quadrant2, quadrant3].forEach((quadrant, i, quadrants) => {
      const currLast = quadrant[quadrant.length - 1];
      const nextFirst = quadrants[(i + 1) % 4][0];
      const [newPositions] = subdivideIndexRows([0], [1], subEdges, [currLast, nextFirst]);
      quadrant.push(...newPositions.flat());
    });
  }

  return [...quadrant0, ...quadrant1, ...quadrant2, ...quadrant3];
}

export function extrudedRingData(
  side: number,
  z: number,
  rPercent: number,
  wPercent: number,
  extrude: number,
  edgeR: number,
  bevelW: number
): [V3[], V3[], V3[], number[]] {
  const eps = 0.001;

  if (wPercent < 0.01) {
    wPercent = 0.01;
  }
  if (edgeR < 0.01) {
    edgeR = 0;
  }
  const ring = !(wPercent > 0.99);
  const roundEdge = edgeR > 0;

  const zEx = z + Math.max(eps, extrude);

  const faceR = rPercent * 0.5;
  const bevelW2 = (bevelW - faceR) / (1 - 2 * faceR);
  const subs = bevelW - faceR < 0.01 ? undefined : bevelW < 0.5 ? [bevelW2, 1 - bevelW2] : 1;

  const innerSide = (1 - wPercent) * side;

  const maxR = Math.min(extrude, ring ? (side - innerSide) / 4 : side / 2);
  const r = edgeR * maxR;

  let upperPosOuter0: V3[];
  let upperPosInner0: V3[] = [];
  let faceIndices: V3[];
  let faceInfo: [number, number][];

  if (ring) {
    upperPosOuter0 = roundedSquarePositions(side - r * 2, zEx, rPercent, true, subs);
    upperPosInner0 = roundedSquarePositions(innerSide + r * 2, zEx, rPercent, true, subs);
    faceInfo = [
      [upperPosInner0.length, innerSide + r * 2],
      [upperPosOuter0.length, side - r * 2],
    ];
    const posLen = upperPosInner0.length;
    faceIndices = indexRingToTriangles(arrayRange(posLen), arrayRange(posLen, posLen));
  } else {
    [upperPosOuter0, faceIndices] = roundedSquareData(side - r * 2, zEx, rPercent, subs);
    faceInfo = [[upperPosOuter0.length, side - r * 2]];
  }

  if (extrude < 0.01) {
    const faceInfoExpanded = faceInfo.map(([i, w]): number[] => Array(i).fill(w)).flat();
    return [[...upperPosInner0, ...upperPosOuter0], faceIndices, [], faceInfoExpanded];
  }

  const len0 = upperPosOuter0.length + upperPosInner0.length;
  let len = 0;

  const positions = [];
  const indices = [];
  const info: [number, number][] = [];

  const vars = [
    [side, 1, 0],
    [innerSide, -1, 1],
  ];

  for (let [iSide, dir, inner] of vars) {
    if (inner && !ring) {
      positions.push([]);
      indices.push([]);
      continue;
    }

    const upperPos = roundedSquarePositions(iSide, zEx, rPercent, true, subs);
    const lowerPos = upperPos.map((p): V3 => [p[0], p[1], z]);
    len = upperPos.length;

    const ar = arrayRange;

    if (!roundEdge) {
      const iF = indexRingToTriangles(ar(len, len0 + (0 + 3 * inner) * len), ar(len, len0 + (1 + 1 * inner) * len));
      positions.push([...upperPos, ...lowerPos]);
      indices.push(iF);
      info.push([len, iSide], [len, iSide]);
      continue;
    }

    const pos1s = iSide - r * dir * 2;
    const upperPos1 = roundedSquarePositions(pos1s, zEx, rPercent, true, subs);

    const upperPos2 = upperPos.map((p, i) => {
      const cp: V3 = [upperPos1[i][0], upperPos1[i][1], upperPos1[i][2] - r];
      return vec3ToV3(vec3.lerp(vec3.create(), cp, p, r / vec3.distance(p, cp)));
    });

    const upperPos3 = upperPos.map((p): V3 => [p[0], p[1], p[2] - r]);

    const i1 = indexRingToTriangles(ar(len, len0 + (0 + 5 * inner) * len), ar(len, len0 + (1 + 3 * inner) * len));
    const i2 = indexRingToTriangles(ar(len, len0 + (1 + 5 * inner) * len), ar(len, len0 + (2 + 3 * inner) * len));
    const iF = indexRingToTriangles(ar(len, len0 + (2 + 5 * inner) * len), ar(len, len0 + (3 + 3 * inner) * len));

    positions.push([...upperPos1, ...upperPos2, ...upperPos3, ...lowerPos]);
    indices.push([...i1, ...i2, ...iF]);
    info.push([len, pos1s], [len, 2 * upperPos2[0][0]], [len, iSide], [len, iSide]);
  }
  const allPositions = [...upperPosInner0, ...upperPosOuter0, ...positions[0], ...positions[1]];
  const allIndices = [...faceIndices, ...indices[0], ...indices[1]];
  const allInfo = [...faceInfo, ...info];

  const normalsOverride: V3[] = [];
  if (roundEdge) {
    for (let i = 0; i < len; i++) {
      const j = len0 + 0 * len + i;
      normalsOverride[j] = [0, 0, 1];
      if (ring) {
        const k = len0 + 4 * len + i;
        normalsOverride[k] = [0, 0, 1];
      }
    }
  }
  const allInfoExpanded = allInfo.map(([i, w]): number[] => Array(i).fill(w)).flat();

  // return [...convertToFacePositions(allPositions, allIndices), [], allInfoExpanded];
  return [allPositions, allIndices, normalsOverride, allInfoExpanded];
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

export function roundedSquareData(side = 1, z = 0, rPercent = 0.25, subs?: number | number[]): [V3[], V3[]] {
  if (rPercent > 0.99) {
    rPercent = 1;
  }
  if (rPercent < 0.01) {
    rPercent = 0;
  }

  const isCircle = rPercent == 1;
  const isSquare = rPercent == 0;

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

  const edges: number[][] = [];

  indicesBatches.forEach((indicesBatch, i) => {
    if (isSquare) {
      if (subs) {
        const [curr, next] = [indicesBatch[0], nextBatchPoints(i)[0]];
        const [newPositions, newPoints] = subdivideIndexRows([next], [curr], subs, allPositions);
        allPositions.push(...newPositions.flat());
        edges.push([next, ...newPoints.flat(), curr]);
      }
    } else {
      allIndices.push(...indexSectorToTriangles(indicesBatch));

      const [curr0, currLast] = [indicesBatch[0], indicesBatch[indicesBatch.length - 1]];
      const [next0, next1] = nextBatchPoints(i);

      let newPoints0: number[][] = [];
      let newPoints1: number[][] = [];

      if (subs) {
        const [extraPositions0, midEdgePoints0] = subdivideIndexRows([next0], [curr0], subs, allPositions);
        allPositions.push(...extraPositions0.flat());
        newPoints0 = midEdgePoints0;
        const [extraPositions1, midEdgePoints1] = subdivideIndexRows([next1], [currLast], subs, allPositions);
        allPositions.push(...extraPositions1.flat());
        newPoints1 = midEdgePoints1;
      }

      const row1 = [next1, ...newPoints1.flat(), currLast];
      const row2 = [next0, ...newPoints0.flat(), curr0];
      allIndices.push(...indexRowsToTriangles(row1, row2));
      edges.push(row2);
    }
  });

  if (subs) {
    allIndices.push(
      ...subdivideInnerFace([edges[0], [...edges[1]].reverse(), [...edges[2]].reverse(), edges[3]], allPositions, subs)
    );
  } else {
    allIndices.push(
      ...indexRowsToTriangles(
        [indicesBatches[1][0], indicesBatches[0][0]],
        [indicesBatches[2][0], indicesBatches[3][0]]
      )
    );
  }

  return [allPositions, allIndices];
}

function subdivideInnerFace(face: number[][], positions: V3[], subs: number | number[]): V3[] {
  const face0b = face[0].slice(1, face[0].length - 1);
  const face2b = face[2].slice(1, face[2].length - 1);
  const [extraPositions, midEdgePoints] = subdivideIndexRows(face0b, face2b, subs, positions);

  positions.push(...extraPositions.flat());

  const triangles: V3[] = [];
  const midRows = midEdgePoints.map((points, i) => [face[1][i + 1], ...points, face[3][i + 1]]);

  const pointsList = [face[0], ...midRows, face[2]];
  pointsList.forEach((_, i) => {
    if (i) {
      triangles.push(...indexRowsToTriangles(pointsList[i - 1], pointsList[i]));
    }
  });
  return triangles;
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

const edgeSplitComponentsToId = (c: V2) => {
  return c[0] * 6 + c[1];
};
const edgeSplitIdToComponents = (id: number): V2 => {
  return divmod(id, 6);
};

const _addTransformedSplitEdges = (edges: number[]) => {
  const _edgeSplitIdToComponents = (id: number): V2 => {
    if (![1, 2, 6, 8, 12, 13].includes(id)) console.error("invalid id: " + id);
    return edgeSplitIdToComponents(id);
  };
  const components = edges.map(_edgeSplitIdToComponents);

  const getBottom = (n: number) => (n == 0 ? 2 : n == 2 ? 0 : 4);
  const rotate90 = (n: number) => (n == 2 ? 0 : n == 0 ? 5 : n);
  const rotate180 = (n: number) => (n == 2 ? 5 : n == 0 ? 3 : n);
  const rotate270 = (n: number) => (n == 2 ? 3 : n == 0 ? 2 : n);

  const a = (f: (n: number) => number, comps: V2[]): V2[] => comps.map((c) => [f(c[0]), f(c[1])]);

  const top = [...components];
  const bot = a(getBottom, top);
  const [top1, top2, top3] = [a(rotate90, top), a(rotate180, top), a(rotate270, top)];
  const [bot1, bot2, bot3] = [a(rotate90, bot), a(rotate180, bot), a(rotate270, bot)];
  return [top, bot, top1, bot1, top2, bot2, top3, bot3].map((comps) => comps.map(edgeSplitComponentsToId));
};

export function roundedCubeData(side = 1, rPercent = 0.25, bevelW: number): [V3[], V3[], number[][]] {
  if (rPercent < 0.01) {
    rPercent = 0;
  }
  if (rPercent > 0.99) {
    rPercent = 1;
  }

  const rounded = rPercent > 0;
  const sphere = rPercent == 1;

  const faceEdgeSplit = true;
  const subdivisions = faceEdgeSplit ? Math.ceil(((rPercent * 480) / 6) ** 0.5) + 1 : Math.max(4, mR(rPercent * 20));

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

  const esi = (id: number) => edgeSplitIdToComponents(id);
  const esc = (component1: number, component2: number) => edgeSplitComponentsToId([component1, component2]);
  // prettier-ignore
  const splitEdges = [
    [ [2, 0], [2, 1] ].map(([c0, c1]) => esc(c0, c1)),
    [ [0, 1], [0, 2] ].map(([c0, c1]) => esc(c0, c1)),
    [ [1, 0], [1, 2] ].map(([c0, c1]) => esc(c0, c1)),
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
  const splitEdgesTransformed: number[][][] = [[], [], [], [], [], [], [], []];

  const addTransformedPositions = (p: vec3) => {
    if (sphere) return;
    const top = getTopPos(p);
    const bot = getBottomPos(top);
    const [top1, top2, top3] = [rotate90Pos(top), rotate180Pos(top), rotate270Pos(top)];
    const [bot1, bot2, bot3] = [rotate90Pos(bot), rotate180Pos(bot), rotate270Pos(bot)];
    [top, bot, top1, bot1, top2, bot2, top3, bot3].forEach((pos, i) => positionsTransformed[i].push(pos));
  };
  positions.forEach(addTransformedPositions);

  const addTransformedSplitEdges = (edges: number[]) => {
    if (sphere) return;
    const transformed = _addTransformedSplitEdges(edges);
    transformed.forEach((edges, i) => splitEdgesTransformed[i].push(edges));
  };
  splitEdges.forEach(addTransformedSplitEdges);

  const midpoints: { [key: string]: { p: number[]; orig: string } } = {};

  const cachePoint = (p: vec3, edge: number[], splitEdge: number[]) => {
    const i = positions.length;
    storeEdgeP(p, edge, i);
    vec3.scale(p, p, r / vec3.length(p)); // normalize to rounded corner sphere radius
    positions.push(p);
    edges.push(edge);
    splitEdges.push(splitEdge);
    addTransformedPositions(p);
    addTransformedSplitEdges(splitEdge);

    return i;
  };

  const cacheMidpoints = (i1: number, i2: number, points: number, _splitEdge?: number[]) => {
    const key = sortNum([i1, i2]).join("-");
    const keyOrig = [i1, i2].join("-");
    if (!midpoints[key]) {
      const [p1, p2] = [positions[i1], positions[i2]];
      const [e1, e2] = [edges[i1], edges[i2]];
      const edge = arrayIntersect(e1, e2);
      const splitEdge = _splitEdge || arrayIntersect(splitEdges[i1], splitEdges[i2]);
      const cacheVal = Array.from({ length: points }, (_, i) =>
        cachePoint(vec3.lerp(vec3.create(), p1, p2, (i + 1) / (points + 1)), [...edge], [...splitEdge])
      );
      midpoints[key] = { p: cacheVal, orig: keyOrig };
    }
    return keyOrig != midpoints[key].orig ? [...midpoints[key].p].reverse() : [...midpoints[key].p];
  };

  const subdivideTriangle = (iA: number, iB: number, iC: number, subs: number) => {
    const edgeA = [...cacheMidpoints(iC, iA, subs - 1), iA];
    const edgeB = [...cacheMidpoints(iC, iB, subs - 1), iB];
    const rows = [[iC]];
    zip(edgeA, edgeB).forEach(([a, b], i) => {
      const midPs = cacheMidpoints(a, b, i);
      rows.push([a, ...midPs, b]);
    });
    for (let i = 1; i < rows.length; i++) {
      const row1 = rows[i - 1];
      const row2 = rows[i];
      const j = row1.length - 1;
      indices.push(...indexRowsToTriangles(row1, row2, false, () => true), [row1[j], row2[j], row2[j + 1]]);
    }
  };

  const subdivideCentroidTriangle = (iA: number, iB: number, iC: number, subs: number) => {
    const [p0, p1, p2] = [positions[iA], positions[iB], positions[iC]];

    const centroid = vec3.create();
    vec3.add(centroid, p0, vec3.add(centroid, p1, p2));
    vec3.normalize(centroid, centroid);
    vec3.scale(centroid, centroid, r);

    const iM = positions.length;

    const getMidSplitEdges = (orig: number[]) => {
      const allowed = orig.map((i) => esi(i)[0]);
      return orig.filter((id) => {
        const [c0, c1] = esi(id);
        return allowed.includes(c0) && allowed.includes(c1);
      });
    };

    const centroidSplitEdges = getMidSplitEdges([...splitEdges[iA], ...splitEdges[iB], ...splitEdges[iC]]);

    positions.push(centroid);
    edges.push([]);
    splitEdges.push(centroidSplitEdges);
    addTransformedPositions(centroid);
    addTransformedSplitEdges(centroidSplitEdges);

    const [iD] = cacheMidpoints(iA, iB, 1, getMidSplitEdges([...splitEdges[iA], ...splitEdges[iB]]));
    const [iE] = cacheMidpoints(iB, iC, 1, getMidSplitEdges([...splitEdges[iB], ...splitEdges[iC]]));
    const [iF] = cacheMidpoints(iC, iA, 1, getMidSplitEdges([...splitEdges[iC], ...splitEdges[iA]]));

    subdivideTriangle(iA, iD, iM, subs - 1);
    subdivideTriangle(iD, iB, iM, subs - 1);

    subdivideTriangle(iB, iE, iM, subs - 1);
    subdivideTriangle(iE, iC, iM, subs - 1);

    subdivideTriangle(iC, iF, iM, subs - 1);
    subdivideTriangle(iF, iA, iM, subs - 1);
  };

  const doSubdivide = faceEdgeSplit ? subdivideCentroidTriangle : subdivideTriangle;

  if (sphere) {
    splitEdges[0].push(esc(2, 3), esc(2, 4));
    splitEdges[1].push(esc(0, 4), esc(0, 5));
    splitEdges[2].push(esc(1, 3), esc(1, 5));

    positions.push([0, 0, -s], [-s, 0, 0], [0, -s, 0]);
    edges.push([], [], []);
    // prettier-ignore
    splitEdges.push(
      [ [5, 0], [5, 1], [5, 3], [5, 4] ].map(([c0, c1]) => esc(c0, c1)),
      [ [3, 1], [3, 2], [3, 4], [3, 5] ].map(([c0, c1]) => esc(c0, c1)),
      [ [4, 0], [4, 2], [4, 3], [4, 5] ].map(([c0, c1]) => esc(c0, c1)),
    );

    doSubdivide(0, 1, 2, subdivisions);
    doSubdivide(1, 3, 2, subdivisions);
    doSubdivide(3, 4, 2, subdivisions);
    doSubdivide(4, 0, 2, subdivisions);

    doSubdivide(1, 0, 5, subdivisions);
    doSubdivide(3, 1, 5, subdivisions);
    doSubdivide(4, 3, 5, subdivisions);
    doSubdivide(0, 4, 5, subdivisions);

    const [allPositions, allIndices] = [positions.map((p) => vec3ToV3(p)), indices];

    // return convertToFacePositions(allPositions, allIndices);
    return [allPositions, allIndices, splitEdges];
  }

  rounded && doSubdivide(0, 1, 2, subdivisions);

  // get positions and indices for all corner triangles
  const getIndex = (i: number, batch: number) => i + batch * positions.length;
  const allPositions: V3[] = [...positionsTransformed].flat();
  const allIndices: V3[] = Array.from(Array(8))
    .map((_, batch): V3[] => indices.map((t) => [getIndex(t[0], batch), getIndex(t[1], batch), getIndex(t[2], batch)]))
    .flat();
  const allSplitEdges = [...splitEdgesTransformed].flat();

  const flat: V3[] = [];

  edgeIndices.forEach((edge) => edge.sort((a, b) => a[0] - b[0]));
  const [edge0Points_, edge1Points_, edge2Points_] = edgeIndices;
  const edge0PointsR = [...edge0Points_].reverse();
  const edge1PointsR = [...edge1Points_].reverse();
  const edge2PointsR = [...edge2Points_].reverse();

  const tops = [];
  const bots = [];
  const sides: number[][] = [];
  const faces: [number[][], number[][], number[][], number[][], number[][], number[][]] = [[], [], [], [], [], []];

  const subN = rounded ? Math.floor(0.001 + ((1 - rPercent) * 10) / 2) * 2 + 1 : bevelW > 0 ? 9 : 3;
  const subs = Array.from({ length: subN }, (_, i) => (i + 1) / (subN + 1));

  if (bevelW - r > 0.01 && bevelW < 0.5) {
    const w = (bevelW - r) / (1 - 2 * r);
    const i = Math.max(1, Math.min(Math.floor(subN / 2), mR(w * (subN + 1)))) - 1;
    subs[i] = w;
    subs[subN - 1 - i] = 1 - w;
  }

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
        const subdivides = subdivideIndexRows(row1, row2, subs, allPositions, allSplitEdges);
        const [extraPositions, midEdgePoints, extraSplitEdges] = subdivides;

        allPositions.push(...extraPositions.flat());
        allSplitEdges.push(...extraSplitEdges.flat());

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
      sides.push([getIndex(1, top0), getIndex(0, top1), getIndex(0, bot0), getIndex(1, bot1)]);
    }
  }

  let edgeFaces: number[][][];

  if (rounded) {
    edgeFaces = faces;
  } else {
    const faces2: number[][][] = [];
    sides.push([tops[3], tops[2], tops[0], tops[1]]);
    sides.push([bots[0], bots[1], bots[3], bots[2]]);

    for (let [t0, t1, b0, b1] of sides) {
      const face: number[][] = [];
      // prettier-ignore
      ([[t0, t1], [t0, b0], [b0, b1], [t1, b1]]).forEach(([i0, i1]) => {
        const subdivides = subdivideIndexRows([i0], [i1], subs, allPositions, allSplitEdges);
        const [extraPositions, midEdgePoints, extraSplitEdges] = subdivides;

        allPositions.push(...extraPositions.flat());
        allSplitEdges.push(...extraSplitEdges.flat());

        face.push([i0, ...midEdgePoints.flat(), i1]);
      });
      faces2.push(face);
    }
    edgeFaces = faces2;
  }

  for (let face of edgeFaces) {
    const face0b = face[0].slice(1, face[0].length - 1);
    const face2b = face[2].slice(1, face[2].length - 1);
    const [extraPositions, midEdgePoints] = subdivideIndexRows(face0b, face2b, subs, allPositions);
    const newSplitEdges = getFlatFaceSplitEdges(face[0], face[1], face[2], face[3], midEdgePoints, allSplitEdges, subN);

    allPositions.push(...extraPositions.flat());
    allSplitEdges.push(...newSplitEdges.flat());

    const midRows = midEdgePoints.map((points, i) => [face[1][i + 1], ...points, face[3][i + 1]]);

    const pointsList = [face[0], ...midRows, face[2]];
    pointsList.forEach((_, i) => {
      if (i) {
        flat.push(...indexRowsToTriangles(pointsList[i - 1], pointsList[i], false, (j) => j == i - 1));
      }
    });
  }

  allIndices.push(...flat);

  // return [...convertToFacePositions(allPositions, allIndices), allSplitEdges];
  return [allPositions, allIndices, allSplitEdges];
}

function getFlatFaceSplitEdges(
  edge_ny: number[],
  edge_nx: number[],
  edge_py: number[],
  edge_px: number[],
  midEdgePoints: number[][],
  splitEdges: number[][],
  subdivisions: number
) {
  const [ny, nx, py, px] = [edge_ny[1], edge_nx[1], edge_py[1], edge_px[1]].map((i) => splitEdges[i][0]);

  const cmp = (a: number, b: number) => a >= Math.abs(b);
  return midEdgePoints.map((row, j) =>
    row.map((col, i) => {
      const x = i - Math.floor(subdivisions / 2);
      const y = j - Math.floor(subdivisions / 2);
      const checks = [cmp(-y, x), cmp(-x, y), cmp(y, x), cmp(x, y)];
      return [ny, nx, py, px].filter((_, k) => checks[k]);
    })
  );
}

function assertAdjacentOnly(arr: number[]) {
  arr.forEach((n) => {
    if (arr.includes(n < 3 ? n + 3 : n - 3)) throw "invalid choice (non adjacent) faces.";
  });
}

function getSplitCube2(x: number, y: number) {
  const ws = [x, y];
  assertAdjacentOnly(ws);

  const all = [0, 1, 2, 3, 4, 5];
  const other = all.filter((a) => !ws.includes(a));

  const esc = (component1: number, component2: number) => edgeSplitComponentsToId([component1, component2]);

  const buckets: number[][] = Array.from({ length: 6 }, () => []);
  for (let [w, w2] of [
    [x, y],
    [y, x],
  ]) {
    const opp = w < 3 ? w + 3 : w - 3;
    const opp2 = w2 < 3 ? w2 + 3 : w2 - 3;
    // full faces
    buckets[w].push(...all.filter((a) => a != w && a != opp).map((a) => esc(w, a)));
    buckets[w].push(...all.filter((a) => a != w2 && a != opp2).map((a) => esc(opp2, a)));
    // adjacent faces
    const [a1, a2] = other.filter((a) => a != opp && a != opp2);
    buckets[w].push(esc(a1, w), esc(a2, w), esc(a1, opp2), esc(a2, opp2));
  }

  return [buckets[x], buckets[y]];
}

function getSplitCube3(x: number, y: number, z: number) {
  const ws = [x, y, z];
  assertAdjacentOnly(ws);

  const all = [0, 1, 2, 3, 4, 5];
  const other = all.filter((a) => !ws.includes(a));

  const esc = (component1: number, component2: number) => edgeSplitComponentsToId([component1, component2]);

  const buckets: number[][] = Array.from({ length: 6 }, () => []);
  for (let w of ws) {
    const opp = w < 3 ? w + 3 : w - 3;
    // full face
    buckets[w].push(...all.filter((a) => a != w && a != opp).map((a) => esc(w, a)));
    // adjacent faces
    const [a1, a2] = other.filter((a) => a != opp);
    buckets[w].push(esc(a1, w), esc(a2, w), esc(a1, a2), esc(a2, a1));
  }

  return [buckets[x], buckets[y], buckets[z]];
}

function getSplitCube6(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const ws = [x0, y0, z0, x1, y1, z1];
  const all = [0, 1, 2, 3, 4, 5];

  const esc = (component1: number, component2: number) => edgeSplitComponentsToId([component1, component2]);

  const buckets: number[][] = Array.from({ length: 6 }, () => []);
  for (let w of ws) {
    const opp = w < 3 ? w + 3 : w - 3;
    // full face
    buckets[w].push(...all.filter((a) => a != w && a != opp).map((a) => esc(w, a)));
  }

  return [buckets[x0], buckets[y0], buckets[z0], buckets[x1], buckets[y1], buckets[z1]];
}

export function splitCubeFaceData(positions: V3[], indices: V3[], splitEdges: number[][], colors: number[]) {
  let bucketsInfo: number[][];

  if (colors.length == 2) {
    bucketsInfo = getSplitCube2(colors[0], colors[1]);
  } else if (colors.length == 3) {
    bucketsInfo = getSplitCube3(colors[0], colors[1], colors[2]);
  } else if (colors.length == 6) {
    bucketsInfo = getSplitCube6(colors[0], colors[1], colors[2], colors[3], colors[4], colors[5]);
  } else {
    return [positions, indices];
  }

  const bucketsMap: { [key: number]: number } = {};
  bucketsInfo.forEach((bucketInfo, n) => bucketInfo.forEach((i) => (bucketsMap[i] = n)));

  const positionsCopy = [...positions];
  const buckets: number[][] = Array.from(bucketsInfo, () => []);
  const bucketedNewIndices: { [key: number]: number }[] = Array.from(bucketsInfo, () => ({}));

  positions.forEach((p, i) => {
    const edgeBuckets = sortNum(arrayUniqueVals(splitEdges[i].map((j) => bucketsMap[j])));

    edgeBuckets.forEach((edgeBucket, bI) => {
      let index = i;
      if (bI) {
        index = positionsCopy.length;
        positionsCopy.push([...p]);
        bucketedNewIndices[edgeBucket][i] = index;
      }
      buckets[edgeBucket].push(index);
    });
  });

  const ordering = buckets.flat();
  const indexMap = Object.fromEntries(ordering.map((oldI, newI) => [oldI, newI]));
  const newPositions = ordering.map((oldI) => positionsCopy[oldI]);

  const newIndices: V3[] = indices.map(([i0, i1, i2]) => {
    const commonEdges = arrayIntersect(splitEdges[i0], arrayIntersect(splitEdges[i1], splitEdges[i2]));
    const edgeBucket = arrayUniqueVals(commonEdges.map((j) => bucketsMap[j]))[0];
    const findNewIndex = (i: number) => indexMap[bucketedNewIndices[edgeBucket][i] ?? i];
    return [findNewIndex(i0), findNewIndex(i1), findNewIndex(i2)];
  });

  return [newPositions, newIndices];
}

function _bevelActions(blockPos: V3) {
  return [
    [0, 1, 2, 1],
    [2, 0, 1, 1],
    [2, 1, 0, -1],
  ]
    .map(([x, y, z, a]): [boolean, number, number, number][] => [
      [!!blockPos[z] && blockPos[x] < 1 && blockPos[y] < 1, y, z, a * 45],
      [!!blockPos[z] && blockPos[x] < 1 && blockPos[y] > -1, y, z, a * (45 + 90)],
      [!!blockPos[z] && blockPos[x] > -1 && blockPos[y] > -1, y, z, a * (45 + 180)],
      [!!blockPos[z] && blockPos[x] > -1 && blockPos[y] < 1, y, z, a * (45 + 270)],
    ])
    .flat();
}

export function addBevel(bevelW: number, blockR: number, blockPos: V3, positions: V3[]) {
  if (bevelW < 0.01) return positions;
  if (!(blockPos[0] || blockPos[1] || blockPos[2])) return positions;

  const s = 0.5; //block s
  const bR = Math.min(blockR, 0.5) * s; //block R

  const diag = Math.sqrt(2) / 2;
  const h = diag - Math.sqrt((bevelW * bevelW) / 2); // target block height

  const actions = _bevelActions(blockPos);

  return positions.map((p): V3 => {
    const res = vec3.fromValues(...p);
    for (let [condition, iY, iZ, th] of actions) {
      if (condition) {
        const rotate = [vec3.rotateX, vec3.rotateY, vec3.rotateZ][iZ];
        rotate(res, res, [0, 0, 0], rad(th));

        const t = Math.min(1, (p[iZ] * Math.sign(blockPos[iZ]) + 0.5) / bevelW);
        const hh = diag + t * (h - diag);

        const q: V3 = [res[0], res[1], res[2]];
        q[iY] = Math.min(res[iY], hh);

        const [y, z] = [q[iY] - h + bR, q[iZ] * Math.sign(blockPos[iZ]) - s + bR];
        if (y > 0 && z > 0) {
          q[iY] = Math.min(y, Math.sqrt(bR * bR - z * z)) + h - bR;
        }
        rotate(res, q, [0, 0, 0], rad(-th));
      }
    }
    return vec3ToV3(res);
  });
}

export function addFaceBevel(bevelW: number, blockPos: V3, positions: V3[], info: number[]) {
  if (bevelW < 0.01) return positions;

  const diag = Math.sqrt(2) / 2;
  const h = diag - Math.sqrt((bevelW * bevelW) / 2); // target block height

  const actions = _bevelActions(blockPos);

  return positions.map((p, i): V3 => {
    const res = vec3.fromValues(...p);
    for (let [condition, iY, iZ, th] of actions) {
      if (condition) {
        const rotate = [vec3.rotateX, vec3.rotateY, vec3.rotateZ][iZ];
        rotate(res, res, [0, 0, 0], rad(th));

        const q: V3 = [res[0], res[1], res[2]];
        q[iY] = Math.min(res[iY], h * (info[i] ?? 1));

        rotate(res, q, [0, 0, 0], rad(-th));
      }
    }
    return vec3ToV3(res);
  });
}
