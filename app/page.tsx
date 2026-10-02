import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { orgId } = await auth();

  return (
    <div className="flex flex-col flex-1 items-center justify-center p-8 bg-zinc-50 dark:bg-black font-sans">
      <main className="flex flex-col w-full max-w-3xl items-start justify-start p-8 bg-white dark:bg-zinc-900 border border-black/[.08] dark:border-white/[.145] rounded-xl shadow-sm">
        <h1 className="text-2xl font-semibold text-black dark:text-white mb-6">
          Workspace Dashboard
        </h1>
        
        <div className="flex flex-col gap-4 w-full text-zinc-600 dark:text-zinc-400">
          <div className="flex flex-col">
            <span className="text-sm font-medium mb-1">Current Organization ID</span>
            {orgId ? (
              <code className="rounded bg-black/[.06] dark:bg-white/[.08] px-3 py-2 font-mono text-sm text-black dark:text-white">
                {orgId}
              </code>
            ) : (
              <p className="text-sm italic">No active organization. Select one using the switcher in the header.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
