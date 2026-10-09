/** Coordinates use the generated map's original 1024 × 1536 space. */
export const MAP_WIDTH = 1024;
export const MAP_HEIGHT = 1536;
export type MapPoint = readonly [number, number];

/** Named fantasy kingdoms; this registry is game geography, not player data. */
export const KINGDOMS = [
  {
    id: 'crownkeep', name: 'Crownkeep', sigil: 'C', numeral: 'I',
    seat: [615, 335], focus: [548, 418],
    patrol: [[540, 463], [608, 448], [659, 405], [633, 370], [586, 392], [507, 395], [472, 441], [506, 470]],
    onward: [[550, 526], [526, 576], [548, 620], [524, 665], [470, 710], [398, 722], [340, 697]],
  },
  {
    id: 'ashen-spire', name: 'Ashen Spire', sigil: 'A', numeral: 'II',
    seat: [247, 578], focus: [309, 690],
    patrol: [[304, 678], [363, 699], [400, 722], [365, 757], [322, 790], [306, 731], [248, 668], [221, 631], [263, 659]],
    onward: [[396, 721], [473, 696], [531, 675], [604, 699], [641, 729]],
  },
  {
    id: 'elderwood', name: 'Elderwood', sigil: 'E', numeral: 'III',
    seat: [795, 629], focus: [715, 746],
    patrol: [[687, 742], [750, 758], [775, 801], [747, 836], [710, 792], [671, 763], [632, 735]],
    onward: [[762, 807], [734, 847], [691, 883], [649, 925], [607, 967], [553, 1001]],
  },
  {
    id: 'moonwell', name: 'Moonwell', sigil: 'M', numeral: 'IV',
    seat: [567, 867], focus: [536, 951],
    patrol: [[499, 987], [553, 1006], [601, 972], [628, 947], [610, 915], [550, 928], [480, 952], [453, 972]],
    onward: [[463, 991], [413, 1021], [361, 1041]],
  },
  {
    id: 'dragonfall', name: 'Dragonfall', sigil: 'D', numeral: 'V',
    seat: [255, 1009], focus: [316, 1033],
    patrol: [[288, 1033], [333, 1054], [389, 1028], [405, 970], [383, 945], [365, 985], [364, 1015], [305, 1018], [257, 1002]],
    onward: [[383, 1033], [468, 1005], [524, 1032], [577, 1006], [566, 1020]],
  },
  {
    id: 'sunken-citadel', name: 'Sunken Citadel', sigil: 'S', numeral: 'VI',
    seat: [600, 1070], focus: [565, 1068],
    // Scouts patrol the shore approach, rather than riding into the sea.
    patrol: [[520, 1054], [552, 1063], [566, 1084], [550, 1100], [516, 1111], [490, 1088], [501, 1058]],
    onward: [[625, 1021], [686, 944], [733, 859], [750, 798], [680, 752], [590, 711], [530, 655], [541, 586], [550, 526]],
  },
] as const;

/** Catmull–Rom curves are shared by the map's ink paths and scout movement. */
export function routePath(points: readonly MapPoint[], closed = true) {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  const at = (i: number) => closed
    ? points[(i + points.length) % points.length]
    : points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - (closed ? 0 : 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
  }
  return closed ? `${d} Z` : d;
}
