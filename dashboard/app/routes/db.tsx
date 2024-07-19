import { Outlet } from "react-router-dom";
import { FireproofMenu } from "~/components/FireproofMenu";

export default function DbIndex() {
  return (
    <div>
      <FireproofMenu />
      <Outlet />
    </div>
  );
}
