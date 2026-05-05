export interface Grade {
  nilai: number | "-" | "";
  huruf: string;
}

export interface Subject {
  name: string;
  kkm: number;
  tulis: Grade;
  lisan: Grade;
  category?: string;
}

export interface Attendance {
  sakit: number;
  izin: number;
  alpha: number;
}

export interface Extracurricular {
  activity: string;
  note: string;
}

export interface Student {
  id: string;
  name: string;
  class: string;
  noUrut: number;
  semester: "GANJIL" | "GENAP";
  tahunPelajaran: string;
  nomorInduk: string;
  subjects: Subject[];
  behavior: {
    spiritual: string;
    social: string;
  };
  extracurriculars: Extracurricular[];
  attendance: Attendance;
  waliKelas?: string;
}
