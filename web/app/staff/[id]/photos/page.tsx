import { PhotoUpload } from "@/components/PhotoUpload";
import { getUploadConfig } from "@/lib/api";

export const metadata = { title: "Photos" };

export default async function PhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const upload = await getUploadConfig();

  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel-head">
          <h2>Add a photo tile</h2>
        </div>
        <p className="panel-sub">
          A phone photo of something real in their life becomes a picture tile, with the same crop and
          corners as the others. Use it for people, places and things the pictogram set doesn&apos;t cover.
        </p>
      <PhotoUpload
        residentId={id}
        initialConfig={upload.ok ? upload.data : null}
        initialError={upload.ok ? null : upload.error}
      />
      </section>
    </div>
  );
}
