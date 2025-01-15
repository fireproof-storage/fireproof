export default function DatabaseIndex() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h2 className="text-2xl font-semibold">Welcome to Fireproof</h2>
      <p className="text-muted-foreground">
        The left sidebar lists database you have created before. To get started writing apps, try{" "}
        <a href="https://use-fireproof.com/docs/react-tutorial/" className="text-[--accent] hover:underline">
          the React tutorial
        </a>
        .
      </p>
    </div>
  );
}
