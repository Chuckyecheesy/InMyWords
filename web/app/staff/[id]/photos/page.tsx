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
    <div className="stack">
      <div className="block">
        <h2>Add a photo</h2>
        <p>A phone photo becomes a tile, with the same crop and corners as the others.</p>
      </div>
      <PhotoUpload
        residentId={id}
        initialConfig={upload.ok ? upload.data : null}
        initialError={upload.ok ? null : upload.error}
      />
    </div>
  );
}
