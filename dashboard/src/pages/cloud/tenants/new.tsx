import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function TenantNew() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement tenant creation API call
    navigate("/fp/cloud");
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Tenant Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded bg-[--muted] px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            required
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center rounded bg-[--accent] px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-[--accent]/80 focus-visible:outline-none focus-visible:ring-2"
        >
          Create Tenant
        </button>
      </form>
    </div>
  );
}
