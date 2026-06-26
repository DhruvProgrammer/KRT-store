// CartPopover is now implemented as a vanilla JS widget inside
// `Navigation.astro`'s inline script. This React component remains only as a
// hydration anchor for Astro island tracking — it renders an empty hidden
// dialog shell which the inline script fills with cart contents on click.
export default function CartPopover() {
  return (
    <div
      id="krt-cart-popover"
      role="dialog"
      aria-label="Shopping cart preview"
      hidden
      className="hidden"
    />
  );
}
