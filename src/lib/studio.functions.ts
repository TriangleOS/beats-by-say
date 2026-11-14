import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { BeatSpec } from "./beat-spec";

// Studio engine server functions. Each one is a single short call to the music service; the browser polls.
const Token = z.string().min(10).max(4000);
const TaskId = z.string().min(4).max(200);

export const studioAvailable = createServerFn({ method: "GET" }).handler(async () => {
  const { studioEnabled } = await import("./studio.server");
  return { enabled: studioEnabled() };
});

export const startStudioBeat = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({ token: Token, prompt: z.string().min(2).max(2000), spec: z.unknown().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { userIdFromToken } = await import("./user.server");
    const userId = await userIdFromToken(data.token);
    const s = await import("./studio.server");
    await s.checkAllowance(data.token, "generate");
    const brief = s.studioBrief(data.prompt, (data.spec as BeatSpec | undefined) ?? null);
    const taskId = await s.startInstrumental(brief, s.callbackUrl());
    await s.logJob(data.token, userId, { task_id: taskId, kind: "generate", prompt: data.prompt });
    return { taskId, preset: brief.preset };
  });

export const studioBeatStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: Token, taskId: TaskId }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./studio.server");
    if (!(await s.ownJob(data.token, data.taskId, "generate"))) throw new Error("Beat not found.");
    return s.instrumentalStatus(data.taskId);
  });

export const startStudioStems = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ token: Token, taskId: TaskId, audioId: z.string().min(4).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { userIdFromToken } = await import("./user.server");
    const userId = await userIdFromToken(data.token);
    const s = await import("./studio.server");
    if (!(await s.ownJob(data.token, data.taskId, "generate"))) throw new Error("Beat not found.");
    // One split per beat: reuse it if the artist masters the same beat again.
    const existing = await s.stemJobFor(data.token, data.taskId);
    if (existing) return { stemTaskId: existing };
    await s.checkAllowance(data.token, "stems");
    const stemTaskId = await s.startStemSplit(data.taskId, data.audioId, s.callbackUrl());
    await s.logJob(data.token, userId, {
      task_id: stemTaskId,
      kind: "stems",
      parent_task_id: data.taskId,
    });
    return { stemTaskId };
  });

export const studioStemStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ token: Token, stemTaskId: TaskId }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./studio.server");
    if (!(await s.ownJob(data.token, data.stemTaskId, "stems")))
      throw new Error("Stems not found.");
    return s.stemStatus(data.stemTaskId);
  });
