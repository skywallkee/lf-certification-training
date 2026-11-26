import { lab } from "@lfct/curriculum/db";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.ts";

type Ids = Record<"new" | "mid" | "golden" | "admin", string>;

/**
 * Sample discussions (ADR 0022), so the feature can be tried without writing posts first: a lesson thread with an
 * accepted answer and a spoiler, a question thread, a lab thread, a mock task thread and one reported post in the
 * moderation queue. Marked as sample text in the posts themselves. Development and test databases only.
 */
export async function seedDiscussions(db: NodePgDatabase<typeof schema>, ids: Ids, now = new Date()): Promise<number> {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);
  const post = async (v: typeof schema.discussionPost.$inferInsert) => {
    const [row] = await db.insert(schema.discussionPost).values(v).returning({ id: schema.discussionPost.id });
    return row!.id;
  };
  let n = 0;

  const lesson = { targetType: "lesson" as const, targetId: "sample-cka-rbac" };
  const q1 = await post({
    ...lesson,
    userId: ids.mid,
    body: "(Sample post) Why does `kubectl auth can-i list pods --as=system:serviceaccount:dev:app` say **no** after I created the Role? The RoleBinding is in `default`.",
    createdAt: at(30),
  });
  const a1 = await post({
    ...lesson,
    parentId: q1,
    userId: ids.golden,
    body: "(Sample post) A RoleBinding only grants access in its own namespace. Create it in `dev`, where the service account and the pods are.",
    accepted: true,
    createdAt: at(28),
  });
  await post({
    ...lesson,
    parentId: q1,
    userId: ids.admin,
    body: "(Sample post) The full fix, if you want it:\n\n```sh\nkubectl -n dev create rolebinding app-read --role=pod-reader --serviceaccount=dev:app\n```",
    spoiler: true,
    createdAt: at(27),
  });
  const tip = await post({
    ...lesson,
    userId: ids.golden,
    body: "(Sample post) Exam tip: `kubectl create role --dry-run=client -o yaml` writes the YAML for you, so you never type `apiGroups` by hand.",
    createdAt: at(50),
  });
  n += 4;
  await db.insert(schema.discussionVote).values([
    { postId: a1, userId: ids.mid },
    { postId: a1, userId: ids.new },
    { postId: tip, userId: ids.mid },
    { postId: tip, userId: ids.new },
    { postId: tip, userId: ids.admin },
  ]);

  const question = { targetType: "question" as const, targetId: "sample-cka-001" };
  const q2 = await post({ ...question, userId: ids.new, body: "(Sample post) Does this depend on whether the cluster has a default StorageClass at all?", createdAt: at(10) });
  await post({
    ...question,
    parentId: q2,
    userId: ids.mid,
    body: "(Sample post) Yes. With a default class the claim gets it and is provisioned; without one it stays Pending.",
    spoiler: true,
    createdAt: at(9),
  });
  n += 2;

  const [rbacLab] = await db.select({ id: lab.id }).from(lab).where(eq(lab.id, "sample-cka-rbac-pod-reader"));
  if (rbacLab) {
    await post({ targetType: "lab", targetId: rbacLab.id, userId: ids.mid, body: "(Sample post) Check my work failed on task 2 until I waited a few seconds for the pod to start. Worth knowing.", createdAt: at(5) });
    n += 1;
  }
  const [fullMock] = await db.select({ id: lab.id, tasks: lab.tasks }).from(lab).where(eq(lab.id, "sample-cka-mock-full"));
  const task = fullMock?.tasks[0];
  if (fullMock && task) {
    await post({
      targetType: "mock-task",
      targetId: `${fullMock.id}/${task.id}`,
      userId: ids.golden,
      body: "(Sample post) Read the task's cluster name first and switch context before anything else; that is where I lost points.",
      createdAt: at(3),
    });
    n += 1;
  }

  // One post in the moderation queue.
  const spam = await post({ ...lesson, userId: ids.new, body: "(Sample post) Buy exam dumps at example.com, real questions!!!", createdAt: at(1) });
  await db.insert(schema.discussionReport).values([
    { postId: spam, userId: ids.mid, reason: "exam-content", details: "Advertises braindumps." },
    { postId: spam, userId: ids.golden, reason: "spam" },
  ]);
  n += 1;

  // The mid-path learner follows the RBAC lesson discussion (they posted in it).
  await db.insert(schema.discussionFollow).values([
    { userId: ids.mid, ...lesson },
    { userId: ids.golden, ...lesson },
    { userId: ids.admin, ...lesson },
    { userId: ids.new, ...question },
    { userId: ids.mid, ...question },
  ]);
  return n;
}
