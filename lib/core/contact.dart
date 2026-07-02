/// Single source of truth for the Switchy support/business contact details.
///
/// The number is the WhatsApp Business line (also the voice line) used across
/// the site, the app and the WhatsApp agent. Never hard-code these digits at a
/// call site — import this file so a future number change is a one-line edit.
library;

/// WhatsApp deep-link form — international digits only, no `+`, no separators
/// (what `wa.me/<number>` expects).
const String kSupportWhatsAppNumber = '972505037537';

/// Human-readable local form for on-screen display (Hebrew UI).
const String kSupportPhoneDisplay = '050-503-7537';

/// `tel:` URI form — E.164 with a leading `+`, dialable from anywhere.
const String kSupportPhoneTel = '+972505037537';
