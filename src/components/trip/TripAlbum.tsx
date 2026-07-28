"use client";

// Masonry-ish rows album (react-photo-album needs true aspect ratios) with a
// lightbox on top (yet-another-react-lightbox), 1200px slides.
import { useState } from "react";
import { Download } from "lucide-react";
import { RowsPhotoAlbum } from "react-photo-album";
import Lightbox from "yet-another-react-lightbox";

import "react-photo-album/rows.css";
import "yet-another-react-lightbox/styles.css";

import { imgUrl } from "@/lib/img-url";

export type AlbumPhoto = {
  id: string;
  width: number;
  height: number;
  city: string | null;
};

export function TripAlbum({ photos }: { photos: AlbumPhoto[] }) {
  const [index, setIndex] = useState(-1);

  const albumPhotos = photos.map((p) => ({
    key: p.id,
    src: imgUrl(p.id, 1200),
    width: p.width,
    height: p.height,
    alt: p.city ?? "Photo",
  }));

  return (
    <>
      <RowsPhotoAlbum
        photos={albumPhotos}
        targetRowHeight={260}
        spacing={10}
        onClick={({ index: i }) => setIndex(i)}
      />
      <Lightbox
        slides={albumPhotos}
        open={index >= 0}
        index={index}
        close={() => setIndex(-1)}
        toolbar={{
          buttons: [
            <a
              key="download"
              href={index >= 0 ? imgUrl(photos[index]?.id ?? "", "orig") : "#"}
              download
              className="yarl__button"
              aria-label="Download original"
            >
              <Download className="size-6" />
            </a>,
            "close",
          ],
        }}
      />
    </>
  );
}
