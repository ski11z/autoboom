/**
 * AutoBoom — Generic Finite State Machine Engine
 * Serializable, with transition guards, timeouts, retry logic, and checkpointing.
 */

const AB_StateMachine = (() => {

    /**
     * Create a new FSM instance.
     * @param {Object} config
     * @param {string} config.id - Unique identifier for this FSM instance
     * @param {string} config.initialState - Starting state
     * @param {Object} config.transitions - Map of state -> [{ event, target, guard?, action? }]
     * @param {Object} [config.timeouts] - Map of state -> { ms, event } — auto-fire event after timeout
     * @param {Function} [config.onTransition] - Called on every transition: (from, to, event, context)
     * @param {Function} [config.onCheckpoint] - Called to persist state: (snapshot)
     * @param {Object} [config.context] - Arbitrary user data carried with the FSM
     */
    function create(config) {
        const instance = {
            id: config.id,
            currentState: config.initialState,
            transitions: config.transitions,
            timeouts: config.timeouts || {},
            onTransition: config.onTransition || (() => { }),
            onCheckpoint: config.onCheckpoint || (() => { }),
            context: config.context || {},
            history: [],
            _timeoutHandle: null,
            _destroyed: false,
        };

        _startTimeout(instance);
        return instance;
    }

    /**
     * Restore an FSM from a serialized snapshot.
     */
    function restore(snapshot, handlers) {
        const instance = {
            id: snapshot.id,
            currentState: snapshot.currentState,
            transitions: handlers.transitions,
            timeouts: handlers.timeouts || {},
            onTransition: handlers.onTransition || (() => { }),
            onCheckpoint: handlers.onCheckpoint || (() => { }),
            context: snapshot.context || {},
            history: snapshot.history || [],
            _timeoutHandle: null,
            _destroyed: false,
        };

        _startTimeout(instance);
        return instance;
    }

    /**
     * Send an event to the FSM, potentially causing a state transition.
     * @returns {{ transitioned: boolean, from: string, to: string, event: string }}
     */
    async function send(instance, event, payload) {
        if (instance._destroyed) {
            AB_Logger.warn('FSM', `Event "${event}" sent to destroyed FSM "${instance.id}"`);
            return { transitioned: false };
        }

        const stateTransitions = instance.transitions[instance.currentState];
        if (!stateTransitions) {
            AB_Logger.warn('FSM', `No transitions defined for state "${instance.currentState}" in FSM "${instance.id}"`);
            return { transitioned: false };
        }

        const transition = stateTransitions.find(t => t.event === event);
        if (!transition) {
            AB_Logger.debug('FSM', `No transition for event "${event}" in state "${instance.currentState}"`);
            return { transitioned: false };
        }

        // Check guard condition
        if (transition.guard && !transition.guard(instance.context, payload)) {
            AB_Logger.debug('FSM', `Guard blocked transition "${instance.currentState}" -> "${transition.target}" on "${event}"`);
            return { transitioned: false };
        }

        const from = instance.currentState;
        const to = transition.target;

        // Clear any existing timeout
        _clearTimeout(instance);

        // Update state
        instance.currentState = to;
        instance.history.push({ from, to, event, timestamp: Date.now() });

        // Trim history to last 50 entries
        if (instance.history.length > 50) {
            instance.history = instance.history.slice(-50);
        }

        AB_Logger.info('FSM', `[${instance.id}] ${from} —(${event})→ ${to}`, payload);

        // Execute transition action
        if (transition.action) {
            try {
                await transition.action(instance.context, payload);
            } catch (err) {
                AB_Logger.error('FSM', `Action error during ${from} -> ${to}:`, err.message);
            }
        }

        // Notify
        try {
            await instance.onTransition(from, to, event, instance.context);
        } catch (err) {
            AB_Logger.error('FSM', `onTransition callback error:`, err.message);
        }

        // Checkpoint (write-ahead)
        try {
            await instance.onCheckpoint(serialize(instance));
        } catch (err) {
            AB_Logger.error('FSM', `Checkpoint error:`, err.message);
        }

        // Start timeout for new state
        _startTimeout(instance);

        return { transitioned: true, from, to, event };
    }

    /**
     * Serialize the FSM to a plain object for storage.
     */
    function serialize(instance) {
        return {
            id: instance.id,
            currentState: instance.currentState,
            context: instance.context,
            history: instance.history,
        };
    }

    /**
     * Get current state.
     */
    function getState(instance) {
        return instance.currentState;
    }

    /**
     * Update context data.
     */
    function updateContext(instance, updates) {
        Object.assign(instance.context, updates);
    }

    /**
     * Destroy the FSM (clear timers).
     */
    function destroy(instance) {
        instance._destroyed = true;
        _clearTimeout(instance);
    }

    // ─── Internal Helpers ───

    function _startTimeout(instance) {
        const timeoutDef = instance.timeouts[instance.currentState];
        if (!timeoutDef) return;

        instance._timeoutHandle = setTimeout(() => {
            AB_Logger.warn('FSM', `Timeout in state "${instance.currentState}" for FSM "${instance.id}"`);
            send(instance, timeoutDef.event, { reason: 'timeout' });
        }, timeoutDef.ms);
    }

    function _clearTimeout(instance) {
        if (instance._timeoutHandle) {
            clearTimeout(instance._timeoutHandle);
            instance._timeoutHandle = null;
        }
    }

    return { create, restore, send, serialize, getState, updateContext, destroy };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.AB_StateMachine = AB_StateMachine;
}
