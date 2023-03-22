import { initFull, solve as solver } from "../../../lib/solver";
import { Axis, Dir, Level } from "./constsEnumsTypes";

export function initSolver() {
  initFull();
}

export async function solve(facelet: string) {
  const solution = solver(facelet);
  if (solution.toUpperCase().includes("ERROR")) {
    console.warn("error solving facelet ", facelet);
    return [];
  }
  const m1: { [key: string]: Axis } = { R: Axis.x, U: Axis.y, F: Axis.z, L: Axis.x, D: Axis.y, B: Axis.z };
  const m2: { [key: string]: Level } = { R: 1, U: 1, F: 1, L: -1, D: -1, B: -1 };

  return solution
    .split(" ")
    .filter((s) => s)
    .map((s): [Axis, Level, Dir, number] => {
      return [m1[s[0]], m2[s[0]], (s[1] == "'" ? 1 : -1) * m2[s[0]], s[1] == "2" ? 2 : 1];
    });
}
