import { Clerk } from "@clerk/clerk-js";

let user;

export const clerk = new Clerk(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
await clerk.load({
  appearance: {
    elements: {
      footerAction: { display: "none" },
    },
  },
});

user = clerk.user;

export const authResult = { user };
