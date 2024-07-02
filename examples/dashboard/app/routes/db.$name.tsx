import { Outlet } from "react-router-dom";
import { Sidebar } from "~/components/Sidebar";

export default function Database() {
  return (
    <div className="flex">
      <div className="w-56"> {/* Fixed width of 16rem (64 units) */}
        <Sidebar />
      </div>
      <div className="flex-1 p-4"> {/* Flex-grow to take remaining space */}
        <Outlet />
      </div>
    </div>
  );
}
