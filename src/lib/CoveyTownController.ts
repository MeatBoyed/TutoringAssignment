import { customAlphabet, nanoid } from 'nanoid';
import { BoundingBox, ServerConversationArea } from '../client/TownsServiceClient';
import { UserLocation } from '../CoveyTypes';
import CoveyTownListener from '../types/CoveyTownListener';
import Player from '../types/Player';
import PlayerSession from '../types/PlayerSession';
import IVideoClient from './IVideoClient';
import TwilioVideo from './TwilioVideo';

const friendlyNanoID = customAlphabet('1234567890ABCDEF', 8);

/**
 * The CoveyTownController implements the logic for each town: managing the various events that
 * can occur (e.g. joining a town, moving, leaving a town)
 */
export default class CoveyTownController {
  get capacity(): number {
    return this._capacity;
  }

  set isPubliclyListed(value: boolean) {
    this._isPubliclyListed = value;
  }

  get isPubliclyListed(): boolean {
    return this._isPubliclyListed;
  }

  get townUpdatePassword(): string {
    return this._townUpdatePassword;
  }

  get players(): Player[] {
    return this._players;
  }

  get occupancy(): number {
    return this._listeners.length;
  }

  get friendlyName(): string {
    return this._friendlyName;
  }

  set friendlyName(value: string) {
    this._friendlyName = value;
  }

  get coveyTownID(): string {
    return this._coveyTownID;
  }

  get conversationAreas(): ServerConversationArea[] {
    return this._conversationAreas;
  }

  /** The list of players currently in the town * */
  private _players: Player[] = [];

  /** The list of valid sessions for this town * */
  private _sessions: PlayerSession[] = [];

  /** The videoClient that this CoveyTown will use to provision video resources * */
  private _videoClient: IVideoClient = TwilioVideo.getInstance();

  /** The list of CoveyTownListeners that are subscribed to events in this town * */
  private _listeners: CoveyTownListener[] = [];

  /** The list of currently active ConversationAreas in this town */
  private _conversationAreas: ServerConversationArea[] = [];

  private readonly _coveyTownID: string;

  private _friendlyName: string;

  private readonly _townUpdatePassword: string;

  private _isPubliclyListed: boolean;

  private _capacity: number;

  constructor(friendlyName: string, isPubliclyListed: boolean) {
    this._coveyTownID = process.env.DEMO_TOWN_ID === friendlyName ? friendlyName : friendlyNanoID();
    this._capacity = 50;
    this._townUpdatePassword = nanoid(24);
    this._isPubliclyListed = isPubliclyListed;
    this._friendlyName = friendlyName;
  }

  /**
   * Adds a player to this Covey Town, provisioning the necessary credentials for the
   * player, and returning them
   *
   * @param newPlayer The new player to add to the town
   */
  async addPlayer(newPlayer: Player): Promise<PlayerSession> {
    const theSession = new PlayerSession(newPlayer);

    this._sessions.push(theSession);
    this._players.push(newPlayer);

    // Create a video token for this user to join this town
    theSession.videoToken = await this._videoClient.getTokenForTown(
      this._coveyTownID,
      newPlayer.id,
    );

    // Notify other players that this player has joined
    this._listeners.forEach(listener => listener.onPlayerJoined(newPlayer));

    return theSession;
  }

  /**
   * Destroys all data related to a player in this town.
   *
   * @param session PlayerSession to destroy
   */
  destroySession(session: PlayerSession): void {
    this._players = this._players.filter(p => p.id !== session.player.id);
    this._sessions = this._sessions.filter(s => s.sessionToken !== session.sessionToken);

    this._conversationAreas.forEach((conversationArea, convoIndex) => {
      if (conversationArea.label === session.player.location.conversationLabel) {
        const index = conversationArea.occupantsByID.indexOf(session.player.id);
        conversationArea.occupantsByID.splice(index, 1);

        this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversationArea));

        if (conversationArea.occupantsByID.length === 0) {
          this._conversationAreas.slice(convoIndex, 1);
          this._listeners.forEach(listener =>
            listener.onConversationAreaDestroyed(conversationArea),
          );
        }
      }
    });

    this._listeners.forEach(listener => listener.onPlayerDisconnected(session.player));
  }

  /**
   * Updates the location of a player within the town
   *
   * If the player has changed conversation areas, this method also updates the
   * corresponding ConversationArea objects tracked by the town controller, and dispatches
   * any onConversationUpdated events as appropriate
   *
   * @param player Player to update location for
   * @param location New location for this player
   */
  updatePlayerLocation(player: Player, location: UserLocation): void {
    if (player.location.conversationLabel !== location.conversationLabel) {
      this._conversationAreas.forEach(conversationArea => {
        // Remove Player's ID from previous ConversationArea
        if (conversationArea.label === player.location.conversationLabel) {
          const index = conversationArea.occupantsByID.indexOf(player.id);
          conversationArea.occupantsByID.splice(index, 1);
          player.setActiveConversationArea(undefined);

          this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversationArea));
        }
      });

      this._conversationAreas.forEach(conversationArea => {
        // Add Player's ID to the new ConversationArea
        if (conversationArea.label === location.conversationLabel) {
          conversationArea.occupantsByID.push(player.id);
          player.setActiveConversationArea(conversationArea);
          this._listeners.forEach(listener => listener.onConversationAreaUpdated(conversationArea));
        }
      });
    }

    player.updateLocation(location);
    this._listeners.forEach(listener => listener.onPlayerMoved(player));
  }

  /**
   * Check if the desired ConversationArea's BoundingBox overlaps with any existing
   * ConversationArea's BoundingBox.
   *
   * @param boudingBox BouningBox to calculate the Coordinates
   *
   * @returns all four Coordinates of the BoudingBox
   */
  getConversationAreaCoordinates = (boudingBox: BoundingBox): number[] => {
    const heightDiff = boudingBox.height / 2;
    const widthDiff = boudingBox.width / 2;

    const xBotLeft = boudingBox.x - widthDiff;
    const yBotLeft = boudingBox.y - heightDiff;

    const xTopRight = boudingBox.x + widthDiff;
    const yTopRight = boudingBox.y + heightDiff;

    const xTopLeft = boudingBox.x - widthDiff;
    const yTopLeft = boudingBox.y + heightDiff;

    const xBotRight = boudingBox.x + widthDiff;
    const yBotRight = boudingBox.y - heightDiff;

    return [xBotLeft, yBotLeft, xTopRight, yTopRight, xTopLeft, yTopLeft, xBotRight, yBotRight];
  };

  /**
   * Check if the desired ConversationArea's BoundingBox overlaps with any existing
   * ConversationArea's BoundingBox.
   *
   * @param mainCoordinates Coordinates of the Bottem Left & Top Right points of the desired ConversationArea to be added
   *
   * @returns Returns True if any BoundingBoxes overlap, false none overlap
   */
  conversationOverlaps(mainCoordinates: number[]): boolean {
    let conversationsOverlap = false;
    for (let i = 0; i < this._conversationAreas.length; i += 1) {
      const newCoordinates = this.getConversationAreaCoordinates(
        this._conversationAreas[i].boundingBox,
      );

      if (
        !(
          mainCoordinates[0] >= newCoordinates[2] ||
          mainCoordinates[2] <= newCoordinates[0] ||
          mainCoordinates[3] <= newCoordinates[1] ||
          mainCoordinates[1] >= newCoordinates[3]
        )
      ) {
        conversationsOverlap = true;
        break;
      }
    }
    return conversationsOverlap;
  }

  /**
   * Check if the player's location is within a ConversationArea's BoundingBox
   *
   * @param player
   * @param conversationAreaCoordinates
   *
   * @return True if the Player is in the BoundingBox, false if not
   */
  isPlayerInConversationArea = (player: Player, conversationAreaCoordinates: number[]): boolean => {
    if (
      player.location.x > conversationAreaCoordinates[4] &&
      player.location.x < conversationAreaCoordinates[6] &&
      player.location.y < conversationAreaCoordinates[5] &&
      player.location.y > conversationAreaCoordinates[7]
    ) {
      return true;
    }

    return false;
  };

  /**
   * Creates a new conversation area in this town if there is not currently an active
   * conversation with the same label.
   *
   * Adds any players who are in the region defined by the conversation area to it.
   *
   * Notifies any CoveyTownListeners that the conversation has been updated
   *
   * @param _conversationArea Information describing the conversation area to create. Ignores any
   *  occupantsById that are set on the conversation area that is passed to this method.
   *
   * @returns true if the conversation is successfully created, or false if not
   */
  addConversationArea(_conversationArea: ServerConversationArea): boolean {
    // Check Topic is a valid string
    if (_conversationArea.topic === '') return false;

    // eslint-disable-next-line no-console
    let conversationAreaLabelExists = false;
    for (let i = 0; i < this._conversationAreas.length; i += 1) {
      if (this.conversationAreas[i].label === _conversationArea.label) {
        conversationAreaLabelExists = true;
        break;
      }
    }
    if (conversationAreaLabelExists) return false;

    // Check the BoundingBox is valid
    const conversationAreaCoordinates = this.getConversationAreaCoordinates(
      _conversationArea.boundingBox,
    );
    if (this.conversationOverlaps(conversationAreaCoordinates)) return false;

    // Add players to the ConversationArea
    this._players.forEach(player => {
      const playerInConvoArea = this.isPlayerInConversationArea(
        player,
        conversationAreaCoordinates,
      );
      if (playerInConvoArea) {
        _conversationArea.occupantsByID.push(player.id);
        player.setActiveConversationArea(_conversationArea);
      }
    });
    // // Invoke another function
    this._listeners.map(coveyTown => coveyTown.onConversationAreaUpdated(_conversationArea));

    // Add Converstation Area to list of Conversation Areas
    this._conversationAreas.push(_conversationArea);

    return true;
  }

  /**
   * Subscribe to events from this town. Callers should make sure to
   * unsubscribe when they no longer want those events by calling removeTownListener
   *
   * @param listener New listener
   */
  addTownListener(listener: CoveyTownListener): void {
    this._listeners.push(listener);
  }

  /**
   * Unsubscribe from events in this town.
   *
   * @param listener The listener to unsubscribe, must be a listener that was registered
   * with addTownListener, or otherwise will be a no-op
   */
  removeTownListener(listener: CoveyTownListener): void {
    this._listeners = this._listeners.filter(v => v !== listener);
  }

  /**
   * Fetch a player's session based on the provided session token. Returns undefined if the
   * session token is not valid.
   *
   * @param token
   */
  getSessionByToken(token: string): PlayerSession | undefined {
    return this._sessions.find(p => p.sessionToken === token);
  }

  disconnectAllPlayers(): void {
    this._listeners.forEach(listener => listener.onTownDestroyed());
  }
}
