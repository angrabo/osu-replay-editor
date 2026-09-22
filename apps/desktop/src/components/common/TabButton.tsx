export function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}
