import { AppShell } from "@/components/AppShell";
import { TILE_RECIPE } from "@/lib/cloudinary";
import { OWNERS } from "@/lib/tasks";

export const metadata = { title: "Task board" };

export default function TaskBoardPage() {
  return (
    <AppShell
      title="Task board"
      lede="One card for every task. The four marked This hour are the setup work."
      backHref="/"
      backLabel="Home"
    >
      <div className="board">
        {OWNERS.map((owner) => (
          <section key={owner.name} className="column" aria-labelledby={`owner-${owner.name}`}>
            <div>
              <h2 id={`owner-${owner.name}`}>{owner.name}</h2>
              <p className="eyebrow">{owner.role}</p>
            </div>
            <ol className="task-list">
              {owner.tasks.map((task) => (
                <li key={task.id} className={task.now ? "task task-now" : "task"}>
                  <p className="task-id">{task.id}</p>
                  <h3>{task.title}</h3>
                  <p>{task.hours}</p>
                  {task.now ? <p className="task-id">This hour</p> : null}
                  <p>
                    <strong>Done when. </strong>
                    {task.doneWhen}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <section className="block">
        <h2>Tile recipe</h2>
        <p>
          Every photo tile uses one Cloudinary chain: a square crop with automatic
          subject focus, the background removed, 40 pixels of padding, and the same
          rounded corners. High contrast adds stronger contrast and a white pad.
          Background removal needs Cloudinary&apos;s AI add-on.
        </p>
        <p className="eyebrow">Calm</p>
        <code className="code">{TILE_RECIPE.calm}</code>
        <p className="eyebrow">High contrast</p>
        <code className="code">{TILE_RECIPE.contrast}</code>
      </section>
    </AppShell>
  );
}
