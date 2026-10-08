import { createContext, useContext } from 'react';

// What slide blocks need from the editor around them. `editable` is false in
// thumbnails, the gallery and in the export, so the same slide component draws all of them.
export const EditorContext = createContext({
  editable: false,
  selectedId: null,
  // Called with (blockId, text) when a rich block changes, and (blockId, value) for plain cells.
  onText: () => {},
  onCell: () => {},
  onFocusBlock: () => {},
  onBlurBlock: () => {},
  // Lets the editor put the caret back after a toolbar command rebuilt a block.
  bus: { current: { pending: null } },
});

export const useEditor = () => useContext(EditorContext);
