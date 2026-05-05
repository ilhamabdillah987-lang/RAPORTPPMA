/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Student, Subject } from './types';
import { ChevronUp, ChevronDown, Printer, UserCircle, Plus, Edit, Trash2, X, Save, LogOut, Lock, User } from 'lucide-react';

const API_BASE = '/api';

const Header = () => (
  <div className="text-center mb-2 double-border-bottom relative">
    <div className="flex items-center justify-center gap-4 py-2">
      <img src="https://drive.google.com/file/d/1IkAUSpwpQaZtECZzTNcSBvhxXZln0RFk/view?usp=sharing" width="80" alt="Logo Al-Hikmah" className="w-18 h-18 object-contain" referrerPolicy="no-referrer" />
      <div>
        <h1 className="text-[11pt] font-bold uppercase leading-tight">YAYASAN PENDIDIKAN ISLAM AL-HIKMAH</h1>
        <h2 className="text-[13pt] font-bold uppercase leading-tight">PESANTREN MODERN AL-HIKMAH</h2>
        <p className="text-[7.5pt] font-medium">Jl. Al-Hikmah Kp. Pondok Jaya RT.05/01 Desa Pondok Jaya Kecamatan Sepatan</p>
        <p className="text-[7.5pt] font-medium">Kabupaten Tangerang Provinsi Banten</p>
      </div>
    </div>
  </div>
);

const StudentInfo = ({ student }: { student: Student }) => (
  <div className="mb-2">
    <table className="table-header w-full text-[9pt]">
      <tbody>
        <tr>
          <td className="w-[18%]">Nama Santri</td>
          <td className="w-[2%]">:</td>
          <td className="w-[40%] font-bold uppercase">{student.name}</td>
          <td className="w-[15%]">Kelas</td>
          <td className="w-[2%]">:</td>
          <td className="w-[23%] font-bold">{student.class}</td>
        </tr>
        <tr>
          <td>Nomor Induk</td>
          <td>:</td>
          <td className="font-bold">{student.nomorInduk}</td>
          <td>Semester</td>
          <td>:</td>
          <td className="relative">
            <span className="font-bold">{student.semester}</span>
            {student.semester === "GANJIL" && (
              <div className="absolute -inset-x-2 -inset-y-1 border-2 border-green-700 pointer-events-none opacity-80 rounded-sm"></div>
            )}
          </td>
        </tr>
        <tr>
          <td>Nomor Urut Absen</td>
          <td>:</td>
          <td className="font-bold">{student.noUrut}</td>
          <td>Tahun Pelajaran</td>
          <td>:</td>
          <td className="font-bold">{student.tahunPelajaran}</td>
        </tr>
      </tbody>
    </table>
    <h3 className="text-[10pt] font-bold mt-3 mb-1 uppercase">D. CAPAIAN KOMPETENSI</h3>
  </div>
);

export default function App() {
  const [user, setUser] = useState<{ id: number; username: string; name: string } | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '' });
  const [authError, setAuthError] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Partial<Student> | null>(null);

  useEffect(() => {
    if (token) {
      fetchUser();
      fetchStudents();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_BASE}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStudentsList(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const url = `${API_BASE}/auth/${authMode}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (res.ok) {
        if (authMode === 'login') {
          setToken(data.token);
          localStorage.setItem('auth_token', data.token);
          setUser(data.user);
        } else {
          setAuthMode('login');
          setAuthError('Registration successful! Please login.');
        }
      } else {
        setAuthError(data.message || 'Authentication failed');
      }
    } catch (e) {
      setAuthError('Server error. Please try again.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setStudentsList([]);
    localStorage.removeItem('auth_token');
  };

  const getHuruf = (nilai: number | string) => {
    if (typeof nilai !== 'number') return "-";
    if (nilai >= 90) return "A";
    if (nilai >= 80) return "B";
    if (nilai >= 70) return "C";
    return "D";
  };

  const selectedStudent = useMemo(() => {
    return studentsList[currentIndex] || studentsList[0];
  }, [studentsList, currentIndex]);

  const studentRankings = useMemo(() => {
    const list = studentsList.map(s => {
      const tulisSum = s.subjects.reduce((sum, sub) => sum + (typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : 0), 0);
      const lisanSum = s.subjects.reduce((sum, sub) => sum + (typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : 0), 0);
      const avg = (tulisSum + lisanSum) / (s.subjects.length * 2);
      return { id: s.id, name: s.name, avg };
    });
    return list.sort((a, b) => b.avg - a.avg).map((s, idx) => ({ ...s, rank: idx + 1 }));
  }, [studentsList]);

  const stats = useMemo(() => {
    if (!selectedStudent) return { tulisTotal: 0, lisanTotal: 0, tulisAvg: "0", lisanAvg: "0" };
    const tulisTotal = selectedStudent.subjects.reduce((sum, sub) => sum + (typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : 0), 0);
    const lisanTotal = selectedStudent.subjects.reduce((sum, sub) => sum + (typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : 0), 0);
    const count = selectedStudent.subjects.length;
    return {
      tulisTotal,
      lisanTotal,
      tulisAvg: (tulisTotal / count).toFixed(2),
      lisanAvg: (lisanTotal / count).toFixed(2)
    };
  }, [selectedStudent]);

  const groupedSubjects = useMemo<Record<string, Subject[]>>(() => {
    if (!selectedStudent) return {};
    const groups: Record<string, Subject[]> = {};
    selectedStudent.subjects.forEach(s => {
      const cat = s.category || 'LAINNYA';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [selectedStudent]);

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    const isEdit = !!editingStudent.id;
    const url = isEdit ? `${API_BASE}/students/${editingStudent.id}` : `${API_BASE}/students`;
    const method = isEdit ? 'PUT' : 'POST';

    const payload = isEdit ? editingStudent : {
      ...editingStudent,
      id: Date.now().toString(),
      noUrut: studentsList.length + 1
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchStudents();
        setIsModalOpen(false);
        setEditingStudent(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus data santri ini?')) {
      try {
        const res = await fetch(`${API_BASE}/students/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const newList = studentsList.filter(s => s.id !== id);
          setStudentsList(newList);
          if (currentIndex >= newList.length && newList.length > 0) {
            setCurrentIndex(newList.length - 1);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const openAddModal = () => {
    setEditingStudent({
      name: '',
      nomorInduk: '',
      class: 'X (SEPULUH)',
      semester: 'GANJIL',
      tahunPelajaran: '2025/2026',
      subjects: [
        { name: "Asasul Mubtadiin Fi Ilmi Nahwi", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Mutammimah", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Asasul Mubtadiin Fi Ilmi Shorfi", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Durusullughah", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Qiraatul Kutub", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Imla'", category: "BAHASA ARAB", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Al-Qur'an", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Tajwid", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Fiqih Ibadah", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Fiqih Muamalah", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Hafalan Hadits", category: "AGAMA", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Grammar", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Stories For You", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Dialogue/Speaking", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Dictation", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } },
        { name: "Vocabularies", category: "BAHASA INGGRIS", kkm: 70, tulis: { nilai: 0, huruf: '-' }, lisan: { nilai: 0, huruf: '-' } }
      ],
      behavior: { spiritual: '', social: '' },
      attendance: { sakit: 0, izin: 0, alpha: 0 },
      extracurriculars: []
    });
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    setEditingStudent({ ...selectedStudent });
    setIsModalOpen(true);
  };

  const handlePrint = () => {
    if (!selectedStudent) return;
    const originalTitle = document.title;
    document.title = `Raport_${selectedStudent.name}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-blue-600 p-8 text-center text-white">
            <div className="bg-white/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <UserCircle size={48} className="text-white" />
            </div>
            <h1 className="text-24 font-bold uppercase">Pesantren Al-Hikmah</h1>
            <p className="text-blue-100 mt-2">Sistem Laporan Belajar Santri</p>
          </div>
          
          <div className="p-8">
            <form onSubmit={handleAuth} className="space-y-4">
              {authError && (
                <div className={`p-4 rounded-lg text-sm ${authError.includes('successful') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {authError}
                </div>
              )}
              
              {authMode === 'register' && (
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-gray-700">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input 
                      required 
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                      placeholder="Masukkan nama lengkap"
                      value={authForm.name} 
                      onChange={e => setAuthForm({...authForm, name: e.target.value})} 
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input 
                    required 
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    placeholder="Username"
                    value={authForm.username} 
                    onChange={e => setAuthForm({...authForm, username: e.target.value})} 
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-gray-700">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input 
                    required 
                    type="password"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                    placeholder="••••••••"
                    value={authForm.password} 
                    onChange={e => setAuthForm({...authForm, password: e.target.value})} 
                  />
                </div>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg active:scale-[0.98]">
                {authMode === 'login' ? 'MASUK' : 'DAFTAR'}
              </button>

              <div className="text-center mt-6">
                <button 
                  type="button" 
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'register' : 'login');
                    setAuthError('');
                  }}
                  className="text-blue-600 hover:underline text-sm font-medium"
                >
                  {authMode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* UI Controls */}
      <div className="controls-panel no-print">
        <div className="flex items-center justify-between mb-4 border-b pb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
            <UserCircle size={18} /> {user.name}
          </div>
          <button onClick={handleLogout} className="text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
        
        {studentsList.length > 0 ? (
          <>
            <label className="text-[10px] uppercase font-bold text-gray-500 mb-1">Pilih Santri</label>
            <select 
              className="select-student mb-2"
              value={currentIndex}
              onChange={(e) => setCurrentIndex(parseInt(e.target.value))}
            >
              {studentsList.map((s, idx) => (
                <option key={s.id} value={idx}>{s.name}</option>
              ))}
            </select>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} className="btn-control flex-1" disabled={currentIndex === 0}>
                <ChevronDown size={18} /> Prev
              </button>
              <button onClick={() => setCurrentIndex(prev => Math.min(studentsList.length - 1, prev + 1))} className="btn-control flex-1" disabled={currentIndex === studentsList.length - 1 || studentsList.length === 0}>
                <ChevronUp size={18} /> Next
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4 text-gray-500 text-xs italic">
            Belum ada data santri.<br/>Klik Tambah untuk memulai.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={openAddModal} className="btn-control bg-green-600 hover:bg-green-700">
            <Plus size={16} /> Tambah
          </button>
          <button onClick={openEditModal} className="btn-control bg-orange-600 hover:bg-orange-700" disabled={studentsList.length === 0}>
            <Edit size={16} /> Edit
          </button>
        </div>

        <button onClick={() => handleDeleteStudent(selectedStudent.id)} className="btn-control bg-red-600 hover:bg-red-700 w-full mb-4" disabled={studentsList.length === 0}>
          <Trash2 size={16} /> Hapus Santri
        </button>

        <button onClick={handlePrint} className="btn-control bg-blue-600 hover:bg-blue-700 w-full" disabled={studentsList.length === 0}>
          <Printer size={18} /> CETAK RAPORT
        </button>
      </div>

      {/* Input Modal */}
      {isModalOpen && editingStudent && (
        <div className="modal-overlay no-print">
          <div className="modal-content">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="text-xl font-bold">{editingStudent.id ? 'Edit Data Santri' : 'Tambah Santri Baru'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-red-500">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSaveStudent}>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-blue-600 mb-4 flex items-center gap-2"><UserCircle size={18} /> Identitas Diri</h3>
                  <div className="form-group">
                    <label className="form-label">Nama Lengkap</label>
                    <input required className="form-input" value={editingStudent.name} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nomor Induk</label>
                    <input required className="form-input" value={editingStudent.nomorInduk} onChange={e => setEditingStudent({...editingStudent, nomorInduk: e.target.value})} />
                  </div>
                   <div className="grid grid-cols-2 gap-2">
                    <div className="form-group">
                      <label className="form-label">Semester</label>
                      <select className="form-input" value={editingStudent.semester} onChange={e => setEditingStudent({...editingStudent, semester: e.target.value as any})}>
                        <option value="GANJIL">GANJIL</option>
                        <option value="GENAP">GENAP</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Kelas</label>
                      <input className="form-input" value={editingStudent.class} onChange={e => setEditingStudent({...editingStudent, class: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tahun Pelajaran</label>
                    <input className="form-input" value={editingStudent.tahunPelajaran} onChange={e => setEditingStudent({...editingStudent, tahunPelajaran: e.target.value})} />
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-green-600 mb-2 flex items-center gap-2"><Edit size={18} /> Nilai Kompetensi</h3>
                  <div className="max-h-[400px] overflow-y-auto pr-2">
                    {editingStudent.subjects?.map((sub, idx) => (
                      <div key={idx} className="mb-4 p-2 border rounded bg-gray-50">
                        <label className="text-xs font-bold block mb-2">{sub.name}</label>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] block">Tulis</label>
                            <input type="number" min="0" max="100" className="form-input" value={typeof sub.tulis?.nilai === 'number' ? sub.tulis.nilai : ''} onChange={e => {
                              const newSubs = [...(editingStudent.subjects || [])];
                              const val = parseInt(e.target.value) || 0;
                              newSubs[idx] = { ...sub, tulis: { nilai: val, huruf: getHuruf(val) } };
                              setEditingStudent({...editingStudent, subjects: newSubs});
                            }} />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] block">Lisan</label>
                            <input type="number" min="0" max="100" className="form-input" value={typeof sub.lisan?.nilai === 'number' ? sub.lisan.nilai : ''} onChange={e => {
                               const newSubs = [...(editingStudent.subjects || [])];
                               const val = parseInt(e.target.value) || 0;
                               newSubs[idx] = { ...sub, lisan: { nilai: val, huruf: getHuruf(val) } };
                               setEditingStudent({...editingStudent, subjects: newSubs});
                            }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-6 pt-4 border-t">
                  <div>
                    <h3 className="font-bold text-orange-600 mb-4">Sikap</h3>
                    <div className="form-group">
                      <label className="form-label text-xs">Catatan Spiritual</label>
                      <textarea className="form-input h-24" value={editingStudent.behavior?.spiritual} onChange={e => setEditingStudent({...editingStudent, behavior: { ...editingStudent.behavior!, spiritual: e.target.value }})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label text-xs">Catatan Sosial</label>
                      <textarea className="form-input h-24" value={editingStudent.behavior?.social} onChange={e => setEditingStudent({...editingStudent, behavior: { ...editingStudent.behavior!, social: e.target.value }})} />
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-bold text-purple-600 mb-4">Kehadiran (Hari)</h3>
                    <div className="grid grid-cols-3 gap-2">
                       <div className="form-group">
                        <label className="form-label text-xs">Sakit</label>
                        <input type="number" className="form-input" value={editingStudent.attendance?.sakit} onChange={e => setEditingStudent({...editingStudent, attendance: { ...editingStudent.attendance!, sakit: parseInt(e.target.value) || 0 }})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label text-xs">Izin</label>
                        <input type="number" className="form-input" value={editingStudent.attendance?.izin} onChange={e => setEditingStudent({...editingStudent, attendance: { ...editingStudent.attendance!, izin: parseInt(e.target.value) || 0 }})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label text-xs">Alpha</label>
                        <input type="number" className="form-input" value={editingStudent.attendance?.alpha} onChange={e => setEditingStudent({...editingStudent, attendance: { ...editingStudent.attendance!, alpha: parseInt(e.target.value) || 0 }})} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="btn-group border-t pt-6">
                <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
                  <Save size={18} /> Simpan Data Santri
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedStudent ? (
        <div className="report-container">
          {/* PAGE 1: COVER */}
          <section className="page flex flex-col items-center justify-center text-center">
            <img src="logo.png" alt="Logo Al-Hikmah" className="w-48 h-48 object-contain mb-12" referrerPolicy="no-referrer" />
            <h1 className="text-3xl font-bold uppercase mb-2">Laporan Hasil Belajar</h1>
            <h2 className="text-xl font-bold uppercase mb-12">Pondok Pesantren Modern Al-Hikmah</h2>
            
            <div className="border-4 border-black p-8 w-full max-w-md mx-auto">
              <table className="w-full text-lg text-left">
                <tbody>
                  <tr><td className="py-2">Nama</td><td className="px-2 text-center">:</td><td className="font-bold border-b border-black uppercase">{selectedStudent.name}</td></tr>
                  <tr><td className="py-2">Nomor Induk</td><td className="px-2 text-center">:</td><td className="font-bold border-b border-black">{selectedStudent.nomorInduk}</td></tr>
                  <tr><td className="py-2">Kelas</td><td className="px-2 text-center">:</td><td className="font-bold border-b border-black">{selectedStudent.class}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="absolute bottom-20 w-full text-center">
              <p className="font-bold uppercase leading-relaxed text-lg">SEMESTER {selectedStudent.semester}</p>
              <p className="font-bold uppercase leading-relaxed text-lg">TAHUN PELAJARAN {selectedStudent.tahunPelajaran}</p>
            </div>
          </section>

          {/* PAGE 2-5 same content but with selectedStudent */}
          <section className="page">
            <Header />
            <StudentInfo student={selectedStudent} />
            <table className="table-raport w-full text-center">
              <thead>
                <tr>
                  <th rowSpan={2} className="w-[5%]">No</th>
                  <th rowSpan={2} className="w-[35%]">Mata Pelajaran</th>
                  <th rowSpan={2} className="w-[8%]">KKM</th>
                  <th colSpan={2} className="w-[26%]">Tulis</th>
                  <th colSpan={2} className="w-[26%]">Lisan</th>
                </tr>
                <tr>
                  <th className="w-[13%]">Nilai</th>
                  <th className="w-[13%]">Huruf</th>
                  <th className="w-[13%]">Nilai</th>
                  <th className="w-[13%]">Huruf</th>
                </tr>
              </thead>
              <tbody>
                {(Object.entries(groupedSubjects) as [string, Subject[]][]).map(([category, subs], catIdx) => (
                  <React.Fragment key={category}>
                    <tr className="category-row">
                      <td colSpan={7} className="font-bold uppercase">{category}</td>
                    </tr>
                    {subs.map((sub, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td className="text-left font-medium">{sub.name}</td>
                        <td>{sub.kkm}</td>
                        <td>{sub.tulis?.nilai ?? '-'}</td>
                        <td className="font-bold">{sub.tulis?.huruf ?? '-'}</td>
                        <td>{sub.lisan?.nilai ?? '-'}</td>
                        <td className="font-bold">{sub.lisan?.huruf ?? '-'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                
                <tr className="font-bold bg-gray-50">
                  <td colSpan={3} className="uppercase">Jumlah</td>
                  <td>{stats.tulisTotal}</td>
                  <td></td>
                  <td>{stats.lisanTotal}</td>
                  <td></td>
                </tr>
                <tr className="font-bold bg-gray-50">
                  <td colSpan={3} className="uppercase">Rata-rata</td>
                  <td>{stats.tulisAvg}</td>
                  <td></td>
                  <td>{stats.lisanAvg}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>

            <div className="signature-section mt-12 text-[10pt] flex justify-between items-start">
              <div className="signature-box flex flex-col items-center flex-1">
                <div className="h-[14pt]"></div>
                <p>Wali Murid,</p>
                <div className="h-20"></div>
                <div className="signature-line w-40"></div>
              </div>
              <div className="signature-box flex flex-col items-center flex-1 text-center">
                <p>Tangerang, 20 Desember 2025</p>
                <p>Wali Kelas,</p>
                <div className="h-20"></div>
                <p className="font-bold border-b border-black inline-block min-w-[120px]">{user.name.toUpperCase()}</p>
              </div>
            </div>
          </section>

          {/* SIKAP */}
          <section className="page border-t-2 mt-8 print:border-none print:mt-0">
            <Header />
            <StudentInfo student={selectedStudent} />
            <h3 className="font-bold mb-2 uppercase">B. SIKAP</h3>
            <table className="table-raport mb-8 text-sm">
              <thead>
                <tr>
                  <th className="w-[30%]">Aspek</th>
                  <th className="w-[70%]">Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-bold">Sikap Spiritual</td>
                  <td className="text-justify px-4 py-3 min-h-[100px]">{selectedStudent.behavior.spiritual || '-'}</td>
                </tr>
                <tr>
                  <td className="font-bold">Sikap Sosial</td>
                  <td className="text-justify px-4 py-3 min-h-[100px]">{selectedStudent.behavior.social || '-'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* EKSTRA & ABSENSI */}
          <section className="page border-t-2 mt-8 print:border-none print:mt-0">
            <Header />
            <StudentInfo student={selectedStudent} />
            
            <h3 className="font-bold mb-2 uppercase">E. EKSTRAKURIKULER</h3>
            <table className="table-raport mb-8 text-sm">
              <thead>
                <tr>
                  <th className="w-[40%] text-center">Kegiatan</th>
                  <th className="w-[60%] text-center">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {selectedStudent.extracurriculars.length > 0 ? selectedStudent.extracurriculars.map((ex, idx) => (
                  <tr key={idx}>
                    <td>{ex.activity}</td>
                    <td>{ex.note}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={2} className="text-center italic py-2 text-gray-400">Tidak ada kegiatan</td></tr>
                )}
              </tbody>
            </table>

            <h3 className="font-bold mb-2">D. ABSENSI</h3>
            <table className="table-raport mb-8 text-sm w-1/2">
              <thead>
                <tr>
                  <th className="w-[60%]">Keterangan</th>
                  <th className="w-[40%]">Jumlah (Hari)</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Sakit</td><td className="text-center">{selectedStudent.attendance.sakit}</td></tr>
                <tr><td>Izin</td><td className="text-center">{selectedStudent.attendance.izin}</td></tr>
                <tr><td>Tanpa Keterangan</td><td className="text-center">{selectedStudent.attendance.alpha}</td></tr>
              </tbody>
            </table>

            <div className="mt-8">
              <h3 className="font-bold mb-2">Keputusan:</h3>
              <div className="border-2 border-black p-6">
                <p>Berdasarkan pencapaian seluruh kriteria, santri ini dinyatakan:</p>
                <p className="mt-6 font-bold text-center text-xl tracking-widest bg-gray-100 py-3 uppercase">
                  {selectedStudent.semester === 'GENAP' ? 'NAIK KE TINGKAT SELANJUTNYA' : 'TETAP SEMANGAT BELAJAR'}
                </p>
              </div>
            </div>
          </section>

          {/* LEDGER */}
          <section className="page border-t-2 mt-8 print:border-none print:mt-0">
            <Header />
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold uppercase">Ledger Nilai Santri</h1>
              <h2 className="text-lg font-bold uppercase">Kelas {selectedStudent.class}</h2>
            </div>
            
            <table className="table-raport text-[10pt]">
              <thead>
                <tr>
                  <th className="w-8">No</th>
                  <th>Nama Santri</th>
                  <th className="w-20">Rata-rata</th>
                  <th className="w-20">Ranking</th>
                </tr>
              </thead>
              <tbody>
                {studentRankings.map((s) => (
                  <tr key={s.id} className={s.id === selectedStudent.id ? 'bg-yellow-50 font-bold' : ''}>
                    <td className="text-center">{s.rank}</td>
                    <td>{s.name}</td>
                    <td className="text-center">{s.avg.toFixed(2)}</td>
                    <td className="text-center font-bold">{s.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center text-gray-500">
           <UserCircle size={64} className="mb-4 opacity-20" />
           <p className="text-lg">Selamat Datang, {user.name}!</p>
           <p className="text-sm">Silakan tambah data santri untuk mulai mencetak raport.</p>
           <button onClick={openAddModal} className="mt-6 btn-primary px-8">
             Tambah Santri Pertama
           </button>
        </div>
      )}
    </div>
  );
}
