


export default function DatabaseIndex() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
    <h2 className="text-2xl font-semibold">Select a database to start</h2>
    <p className="text-muted-foreground">Choose a database from the left sidebar to get started.</p>
  </div>
  );
}

// function DatabaseList({ databases }: { databases: string[] }) {
//   return (
//     <div className="p-4">
//       <h2 className="text-xl font-bold mb-2">Available Databases</h2>
//       <div className="relative overflow-x-auto dark mt-4">
//         <div className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
//           <div className="text-xs text-gray-700 bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
//             <div key={"header" + Math.random()} className="px-6 py-3">
//               Database Name
//             </div>
//           </div>
//           <div>
//             {databases.map((db, index) => (
//               <div
//                 key={db}
//                 className={`bg-white dark:bg-gray-800 ${index < databases.length - 1 ? "border-b dark:border-gray-700" : ""}`}
//               >
//                 <div className="px-6 py-4">
//                   <Link
//                     to={`/fp/databases/${db}`}
//                     className="underline text-blue-500"
//                   >
//                     {db}
//                   </Link>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }