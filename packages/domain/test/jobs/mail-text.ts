// What a test reads of the text version of a mail: the lines between its title and its link.

/** The lines of the sections and warnings, without the title, the link or the footer. */
export const inner = (body: string): string[] => {
  const lines = body.split("\n").slice(2);
  const end = lines.findIndex((line) => line.startsWith("Abrir Atlas: ") || line === "--");
  const kept = end === -1 ? lines : lines.slice(0, end);
  return kept.at(-1) === "" ? kept.slice(0, -1) : kept;
};

/** The title line of the text version. */
export const titleOf = (body: string): string => body.split("\n")[0] as string;
