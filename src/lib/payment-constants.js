// Plain (non server-only) constants shared between the server code that
// records payment-link transactions and the client that displays them.
// The transaction's `notas` field carries this exact marker, so it is the
// single source of truth for recognizing that a QR collection actually came
// through a payment link rather than an in-person QR at the counter.
export const PAYMENT_LINK_NOTE = "Pago por enlace de pago";
