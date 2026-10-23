// What an agent is doing right now (not to be confused with its lifecycle: live / in development / planned).
// The hard hat, the pad under the agent and the pin on the map all take this colour.
export const RUN = {
  working: { label: 'Працює', color: 0x3fc77a, css: '#3FC77A', ink: '#0E4D2B' },
  paused: { label: 'На паузі', color: 0xf5c238, css: '#F5C238', ink: '#4D3A00' },
  waiting: { label: 'Очікує задач', color: 0x4da8f5, css: '#4DA8F5', ink: '#0B3A66' },
  problem: { label: 'Проблема', color: 0xef4d5e, css: '#EF4D5E', ink: '#5A0E18' },
  inactive: { label: 'Неактивний', color: 0xa7a0b0, css: '#A7A0B0', ink: '#2F2B35' },
};
// The state of every agent comes from the page (real activity, see useAgentRunStates); an agent with no state yet is inactive.
export const runOf = (a) => (a.run && RUN[a.run] ? a.run : 'inactive');
