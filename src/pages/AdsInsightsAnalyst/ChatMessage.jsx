export default function ChatMessage({ role, content }) {
  return (
    <div className={'aia-msg aia-msg-' + role}>
      <div className="aia-msg-bubble">{content}</div>
    </div>
  );
}
