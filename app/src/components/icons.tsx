import type { SVGProps } from "react";

/**
 * Marks that aren't in lucide.
 *
 * lucide's `Github` is a stroked outline drawn for a UI icon set; next to
 * 13-15px text it reads thinner than the type around it and noticeably lighter
 * than roxy.gg's header, which uses the solid octocat. Both paths below are
 * single solid fills, so they inherit `currentColor` and sit on the same
 * optical weight as their label.
 */
/** GitHub "octocat" mark. Identical to the one roxy.gg's nav ships. */
export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.575.106.785-.25.785-.554 0-.273-.01-.998-.015-1.96-3.2.695-3.877-1.543-3.877-1.543-.523-1.328-1.278-1.682-1.278-1.682-1.044-.714.08-.7.08-.7 1.155.082 1.762 1.186 1.762 1.186 1.026 1.758 2.693 1.25 3.35.955.104-.743.401-1.25.73-1.538-2.554-.29-5.238-1.277-5.238-5.686 0-1.256.449-2.283 1.185-3.088-.119-.29-.513-1.46.112-3.045 0 0 .966-.31 3.166 1.18a11.02 11.02 0 0 1 2.882-.388c.977.005 1.962.132 2.882.388 2.2-1.49 3.164-1.18 3.164-1.18.626 1.585.232 2.755.114 3.045.738.805 1.183 1.832 1.183 3.088 0 4.42-2.688 5.393-5.25 5.677.413.357.78 1.06.78 2.137 0 1.543-.014 2.787-.014 3.167 0 .307.207.667.79.553A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  );
}

/** Filled star. Unused while the nav's star badge is hidden -- see
 *  useRepoStats.ts for why it is kept rather than deleted. */
export function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 17.27l6.18 3.73-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z"
      />
    </svg>
  );
}
