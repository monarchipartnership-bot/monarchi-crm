import '../../styles/designTodo.css';

// A visible marker on an element that is built (it works) but has no design yet. To remove them all once the design is done:
// delete the <DesignTodo /> lines (search for «DesignTodo») and this file with src/styles/designTodo.css.
export default function DesignTodo({ note }) {
  return <span className="design-todo" title={note || 'Новий елемент: функція готова, оформлення ще немає.'}>Отдать дизайн чату</span>;
}
