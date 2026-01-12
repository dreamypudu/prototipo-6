
import { MechanicEvent, CanonicalAction, ExpectedAction } from '../types';

/**
 * Service to bridge modular mechanics and the core psychometric engine.
 * Allows mechanics to log rich events and commit canonical actions without
 * knowing the scenario context, and allows scenarios to define expectations.
 */
class MechanicEngine {
  private static instance: MechanicEngine;
  private eventBuffer: MechanicEvent[] = [];
  private canonicalBuffer: CanonicalAction[] = [];
  private expectedBuffer: ExpectedAction[] = [];

  private constructor() {}

  public static getInstance(): MechanicEngine {
    if (!MechanicEngine.instance) {
      MechanicEngine.instance = new MechanicEngine();
    }
    return MechanicEngine.instance;
  }

  /**
   * Logs a rich, mechanic-specific event for ML analysis.
   */
  public emitEvent(mechanicId: string, eventType: string, payload: Record<string, any>): MechanicEvent {
    const event: MechanicEvent = {
      event_id: crypto.randomUUID(),
      mechanic_id: mechanicId,
      event_type: eventType,
      timestamp: Date.now(),
      payload
    };
    this.eventBuffer.push(event);
    console.debug(`[MechanicEvent] ${mechanicId}:${eventType}`, payload);
    return event;
  }

  /**
   * Commits a standardized action that can be compared with scenario expectations.
   */
  public emitCanonicalAction(mechanicId: string, actionType: string, targetRef: string, valueFinal: any, context?: Record<string, any>): CanonicalAction {
    const action: CanonicalAction = {
      canonical_action_id: crypto.randomUUID(),
      mechanic_id: mechanicId,
      action_type: actionType,
      target_ref: targetRef,
      value_final: valueFinal,
      committed_at: Date.now(),
      context
    };
    this.canonicalBuffer.push(action);
    console.debug(`[CanonicalAction] ${actionType} on ${targetRef}`, valueFinal);
    return action;
  }

  /**
   * Registers a list of actions expected from the user following a dialogue choice.
   */
  public registerExpectedActions(nodeId: string, optionId: string, actions: Partial<ExpectedAction>[]): ExpectedAction[] {
    const normalized: ExpectedAction[] = actions.map(a => ({
      expected_action_id: crypto.randomUUID(),
      source: { node_id: nodeId, option_id: optionId },
      action_type: a.action_type || 'unknown',
      target_ref: a.target_ref || 'global',
      constraints: a.constraints || {},
      rule_id: a.rule_id || 'default_rule',
      created_at: Date.now(),
      mechanic_id: a.mechanic_id
    }));
    this.expectedBuffer.push(...normalized);
    return normalized;
  }

  /**
   * Flushes and returns the current buffers to be saved in GameState.
   */
  public flush() {
    const data = {
      events: [...this.eventBuffer],
      canonical: [...this.canonicalBuffer],
      expected: [...this.expectedBuffer]
    };
    this.eventBuffer = [];
    this.canonicalBuffer = [];
    this.expectedBuffer = [];
    return data;
  }
}

export const mechanicEngine = MechanicEngine.getInstance();
