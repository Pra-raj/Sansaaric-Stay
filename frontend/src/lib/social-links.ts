import type { ComponentType, SVGProps } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  WhatsAppIcon,
} from "@/components/icons/icons";

export const CONTACT_PHONE = "9860075548";
export const CONTACT_PHONE_DISPLAY = "+977 9860075548";
export const CONTACT_TEL_HREF = "tel:+9779860075548";
export const WHATSAPP_HREF = "https://wa.me/9779860075548";

export interface SocialLink {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Short handle or description shown on the contact cards. */
  handle: string;
}

/**
 * The real Sansaaric Stay profiles. Used by the footer and the contact page,
 * so both always point to the same places.
 */
export const socialLinks: SocialLink[] = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/1FKDJxx47K/?mibextid=wwXIfr",
    icon: FacebookIcon,
    handle: "Follow our Facebook page",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/sansaaric.stay?stkn=bGZwcXhmMXh2cWk=",
    icon: InstagramIcon,
    handle: "@sansaaric.stay",
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@sansaaric.stay?_r=1&_t=ZS-99a7XLQl2Zt",
    icon: TikTokIcon,
    handle: "@sansaaric.stay",
  },
  {
    label: "WhatsApp",
    href: WHATSAPP_HREF,
    icon: WhatsAppIcon,
    handle: CONTACT_PHONE_DISPLAY,
  },
];
