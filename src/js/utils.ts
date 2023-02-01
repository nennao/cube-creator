export function mR(x: number, dp: number = 0) {
  return Math.round((x + Number.EPSILON) * Math.pow(10, dp)) / Math.pow(10, dp);
}

export function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function randInt(x: number) {
  return Math.floor(Math.random() * x);
}

export function shuffle<T>(array: T[], inPlace = false): T[] {
  if (!inPlace) {
    array = [...array];
  }
  let m = array.length;
  let i: number;
  let t;
  while (m) {
    i = Math.floor(Math.random() * m--);
    t = array[m];
    array[m] = array[i];
    array[i] = t;
  }
  return array;
}
