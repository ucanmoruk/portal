import { receiveSpektrotekOrder } from "@/lib/spektrotekCommerce";
import { spektrotekJson } from "@/lib/spektrotekHttp";

export async function POST(request: Request) {
  return spektrotekJson(request, receiveSpektrotekOrder);
}
