import { getSiteSettings } from "../../lib/admin";
import { defaultSiteSettings } from "../../lib/site-settings";

export async function GET() {
  try {
    return Response.json(await getSiteSettings(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ...defaultSiteSettings, acceptingOrders: false }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
