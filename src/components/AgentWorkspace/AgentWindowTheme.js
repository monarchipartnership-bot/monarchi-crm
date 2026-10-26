import { createContext, useContext } from 'react';

// Whether the agent windows draw their dark plum look: the page of the AI Agents section provides it (dark in the dark sections and at night on the
// map, light by day on the map). Outside the section the windows are light.
export const AgentWindowTheme = createContext({ night: false });
export const useAgentWindowNight = () => useContext(AgentWindowTheme).night;
