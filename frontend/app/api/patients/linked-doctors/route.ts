/** GET /api/patients/linked-doctors/ — doctors the signed-in patient may share health records with. */
import { handler, ok, requirePatient } from "@/lib/route";
import { listLinkedDoctors } from "@/services/treatment.service";

export const GET = handler(async (ctx) => {
  const user = await requirePatient(ctx.req);
  return ok(await listLinkedDoctors(user));
});
