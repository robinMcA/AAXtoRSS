export type ProbeChapter = {
  id: number;
  time_base: string;
  start: number;
  start_time: string;
  end: number;
  end_time: string;
  tags: { title: string };
};

export type ProbFormat = {
  filename: string;
  nb_streams: number;
  nb_programs: number;
  format_name: string;
  format_long_name: string;
  start_time: string;
  duration: string;
  size: string;
  bit_rate: string;
  probe_score: number;
  tags?: {
    major_brand?: string;
    minor_version?: string;
    compatible_brands?: string;
    title?: string;
    artist?: string;
    album_artist?: string;
    album?: string;
    date?: string;
    encoder?: string;
    comment?: string;
    genre?: string;
    copyright?: string;
  };
};

export type ProbeOut = {
  chapters: ProbeChapter[];
  format: ProbFormat;
};
export type BucketInfo = { bucket: string; key: string };

export type SplitMessage = { chapter: ProbeChapter; outFile: BucketInfo };
