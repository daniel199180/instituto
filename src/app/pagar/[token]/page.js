import { PaymentLinkClient } from "./payment-link-client";

export default async function PaymentLinkPage({ params }) {
  const { token } = await params;

  return <PaymentLinkClient token={token} />;
}
