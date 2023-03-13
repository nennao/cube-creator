import { initFull, solve as solver } from "../../lib/solver";

export function initSolver() {
  initFull();
}

export async function solve(facelet: string) {
  const solution = solver(facelet);
  if (solution.toUpperCase().includes("ERROR")) {
    console.warn("error solving facelet ", facelet);
    return [];
  }
  const m1: { [key: string]: "x" | "y" | "z" } = { R: "x", U: "y", F: "z", L: "x", D: "y", B: "z" };
  const m2: { [key: string]: 1 | -1 } = { R: 1, U: 1, F: 1, L: -1, D: -1, B: -1 };

  return solution
    .split(" ")
    .filter((s) => s)
    .map((s): ["x" | "y" | "z", number, number, number] => {
      return [m1[s[0]], m2[s[0]], (s[1] == "'" ? 1 : -1) * m2[s[0]], s[1] == "2" ? 2 : 1];
    });
}
