import { handler, ok, readJson } from "@/lib/route";
import { requireDoctor } from "@/lib/auth";
import { exceptionDto } from "@/lib/serializers";
import { listOwnExceptions, createOwnException } from "@/services/schedule.service";

/** GET/POST /api/doctors/me/schedule/exceptions/ — one-off closures. */
export const GET = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  return ok((await listOwnExceptions(user)).map(exceptionDto));
});

export const POST = handler(async ({ req }) => {
  const user = await requireDoctor(req);
  const body = await readJson(req);
  const item = await createOwnException(user, body);
  return ok(exceptionDto(item), "Schedule exception added.", 201);
});
