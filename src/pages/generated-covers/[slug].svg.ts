import type { APIRoute, GetStaticPaths } from "astro";
import { isPublicEntity } from "../../domain/publication.js";
import { WorkSchema } from "../../domain/schemas/entities.js";
import { renderGeneratedCoverSvg } from "../../images/generated-cover.js";
import { loadCatalog } from "../../lib/catalog.js";

const mediaLabels = {
  book: "书籍",
  documentary: "纪录片",
  film: "电影",
  other: "其他",
  podcast: "播客",
  television: "电视剧",
} as const;

export const getStaticPaths: GetStaticPaths = async () => {
  const catalog = await loadCatalog();
  return catalog.works
    .filter(isPublicEntity)
    .map((work) => ({ params: { slug: work.slug }, props: { work } }));
};

export const GET: APIRoute = ({ props }) => {
  const work = WorkSchema.parse(Reflect.get(props, "work"));
  return new Response(
    renderGeneratedCoverSvg({
      title: work.title,
      mediaLabel: mediaLabels[work.mediaType],
    }),
    {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
};
