export const routes = (route: any) => {
  route("/", "pages/index.tsx", { index: true }); // Initial redirect to /fp
  route("/fp/databases", "layouts/app.tsx", () => {
    route("", "pages/databases/index.tsx", { index: true });
    route(":name", "pages/databases/show.tsx");
    route(":name/history", "pages/databases/history.tsx");
    route(":name/docs/:id", "pages/docs/show.tsx")
  });
}

  
