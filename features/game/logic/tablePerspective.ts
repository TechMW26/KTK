/** Reflect the whole table, keeping card identities and edge distances intact. */
export function oppositePoint(point: { x: number; y: number }, width: number, height: number) {
  return { x: width - point.x, y: height - point.y };
}

export function oppositeRowOffset(boardHeight: number, rowTop: number, rowHeight: number) {
  return boardHeight - 2 * rowTop - rowHeight;
}

/** The pointer's owner decides its screen side, independently of deck rotation. */
export function pointingHandPose(opposite: boolean, fromOpponent: boolean) {
  const screenContact = fromOpponent ? .3 : .7;
  return {
    contact: opposite ? 1 - screenContact : screenContact,
    facing: opposite !== fromOpponent ? "180deg" : "0deg",
  };
}
