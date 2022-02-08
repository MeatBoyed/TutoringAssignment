import { BoundingBox, ConversationAreaCoordinates, Coordinate } from './client/TownsServiceClient';

/**
 * This function exists solely to help satisfy the linter + typechecker when it looks over the
 * stubbed (not yet implemented by you) functions. Remove calls to it as you go.
 *
 * @param _args
 */
// eslint-disable-next-line
export function removeThisFunctionCallWhenYouImplementThis(_args1?: any, _args2?: any): Error {
  return new Error('Unimplemented');
}

// eslint-disable-next-line
export function logError(err: any): void {
  // eslint-disable-next-line no-console
  console.trace(err);
}

/**
 * Check if the desired ConversationArea's BoundingBox overlaps with any existing
 * ConversationArea's BoundingBox.
 *
 * @param boudingBox BouningBox to calculate Coordinates
 *
 * @returns The leftPoint and rightPoint coordinates
 */
export function getConversationAreaCoordinates(boudingBox: BoundingBox): number[] {
  const heightDiff = boudingBox.height / 2;
  const widthDiff = boudingBox.width / 2;

  const xBotLeft = boudingBox.x - widthDiff;
  const yBotLeft = boudingBox.y - heightDiff;

  const xTopRight = boudingBox.x + widthDiff;
  const yTopRight = boudingBox.y + heightDiff;

  return [xBotLeft, yBotLeft, xTopRight, yTopRight];
}

export function getConversationAreaCoordinate(
  boudingBox: BoundingBox,
): ConversationAreaCoordinates {
  const heightDiff = boudingBox.height / 2;
  const widthDiff = boudingBox.width / 2;

  const xTopLeft = boudingBox.x - widthDiff;
  const yTopLeft = boudingBox.y + heightDiff;

  const xBotRight = boudingBox.x + widthDiff;
  const yBotRight = boudingBox.y - heightDiff;

  const TopLeft: Coordinate = { x: xTopLeft, y: yTopLeft };
  const BotRight: Coordinate = { x: xBotRight, y: yBotRight };

  return { leftPoint: TopLeft, rightPoint: BotRight };
}
