import { Student, Subject } from './types';

const categories = [
  {
    name: "BAHASA ARAB",
    items: [
      "Anas Mukhtarin Fil Ilmi Nahwi",
      "Mutammimah",
      "Anas Mukhtarin Fil Ilmi Shorfi",
      "Durusullughah",
      "Qiraatul Kutub",
      "Imla'"
    ]
  },
  {
    name: "AGAMA",
    items: [
      "Al-Qur'an",
      "Tajwid",
      "Fiqih Ibadah",
      "Fiqih Muamalah",
      "Hafalan Hadits"
    ]
  },
  {
    name: "BAHASA INGGRIS",
    items: [
      "Grammar",
      "Stories For You",
      "Dialogue/Speaking",
      "Dictation",
      "Vocabularies"
    ]
  }
];

const getHuruf = (nilai: number | string) => {
  if (typeof nilai !== 'number') return "-";
  if (nilai >= 90) return "A";
  if (nilai >= 80) return "B";
  if (nilai >= 70) return "C";
  return "D";
};

const createDefaultSubjects = (): Subject[] => {
  const subs: Subject[] = [];
  categories.forEach(cat => {
    cat.items.forEach(name => {
      const tulisNilai = Math.floor(Math.random() * 30) + 70;
      const lisanNilai = Math.floor(Math.random() * 30) + 70;
      subs.push({
        name,
        category: cat.name,
        kkm: 70,
        tulis: { nilai: tulisNilai, huruf: getHuruf(tulisNilai) },
        lisan: { nilai: lisanNilai, huruf: getHuruf(lisanNilai) }
      });
    });
  });
  return subs;
};

export const students: Student[] = [
  {
    id: "1",
    name: "ABDUL ROUF ZAIN",
    nomorInduk: "123/456-789",
    class: "X (SEPULUH)",
    noUrut: 1,
    semester: "GANJIL",
    tahunPelajaran: "2025/2026",
    subjects: createDefaultSubjects(),
    behavior: {
      spiritual: "Menunjukkan ketaatan dalam beribadah dan selalu memulai kegiatan dengan doa.",
      social: "Memiliki sikap santun, jujur, dan peduli terhadap sesama santri."
    },
    extracurriculars: [
      { activity: "Pramuka", note: "Aktif" }
    ],
    attendance: { sakit: 0, izin: 1, alpha: 0 }
  }
];
