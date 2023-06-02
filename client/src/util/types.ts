export type Chapter = {
  start_time: string;
  time_base: string;
  start: number;
  end_time: string;
  end: number;
  id: number;
  tags: { title: string };
};

export type S3FileData = { bucket: string; key: string };

export type AudioFile = {
  chapters: Chapter[];
  infile: S3FileData;
  doneCaps?: number[];
  outFile: S3FileData;
  s3Key: string;
  format: {
    duration: string;
    start_time: string;
    bit_rate: string;
    filename: string;
    size: string;
    probe_score: number;
    nb_programs: number;
    format_long_name: string;
    nb_streams: number;
    format_name: string;
    tags: {
      date: string;
      copyright: string;
      artist: string;
      album_artist: string;
      album: string;
      major_brand: string;
      genre: string;
      comment: string;
      title: string;
      encoder: string;
      minor_version: string;
      compatible_brands: string;
    };
  };
};
