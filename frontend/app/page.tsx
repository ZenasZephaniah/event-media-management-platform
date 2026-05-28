"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, CheckCircle, Loader2, Download, Heart, MessageCircle, Sparkles, UserCheck, Search } from "lucide-react";

const MY_USER_ID = "e11bcc3a-d89e-42bc-add3-d11128ed6fcb";
const MY_ALBUM_ID = "26bce404-c1ca-4957-9dae-6b363a6cd0ce";

// 🔥 Dynamically switch between Local and Production Backend!
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [gallery, setGallery] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState(""); // Search State

  const fetchGallery = async () => {
    try {
      const res = await fetch(`${API_URL}/api/media`);
      const data = await res.json();
      setGallery(data);
    } catch (error) { console.error("Failed to fetch gallery", error); }
  };

  useEffect(() => { fetchGallery(); }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setMessage("Uploading to AWS & Analyzing with AI...");

    try {
      const res = await fetch(`${API_URL}/api/media/get-upload-url`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, fileType: file.type }),
      });
      const { uploadUrl, s3Url, s3Key } = await res.json();
      
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

      const mediaType = file.type.startsWith("video") ? "VIDEO" : "PHOTO";
      await fetch(`${API_URL}/api/media/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Url, s3Key, type: mediaType, size: file.size, albumId: MY_ALBUM_ID, uploaderId: MY_USER_ID }),
      });

      setMessage("Pipeline Complete! 🎉");
      fetchGallery();
    } catch (error: any) { setMessage(`Error: ${error.message}`); } 
    finally { setUploading(false); setTimeout(() => setMessage(""), 5000); }
  }, []);

  const handleLike = async (mediaId: string) => {
    await fetch(`${API_URL}/api/media/${mediaId}/like`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: MY_USER_ID })
    });
    fetchGallery();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // 🔥 ADVANCED SEARCH ENGINE LOGIC
  // 🔥 ADVANCED SEARCH ENGINE LOGIC (Bulletproofed)
  const safeGallery = Array.isArray(gallery) ? gallery : [];
  const filteredGallery = safeGallery.filter((media) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    // Safely check tags and uploader name
    const matchTag = media.tags && Array.isArray(media.tags) 
      ? media.tags.some((tag: string) => tag.toLowerCase().includes(query)) 
      : false;
      
    const matchUser = media.uploader?.name?.toLowerCase().includes(query);
    
    return matchTag || matchUser;
  });

  return (
    <main className="min-h-screen bg-[#f8fafc] pb-20">
      <div className="bg-white border-b border-gray-200 shadow-sm pt-16 pb-12 mb-12">
        <div className="max-w-3xl mx-auto text-center px-6">
          <div className="inline-flex items-center justify-center space-x-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm font-bold mb-6">
            <Sparkles className="w-4 h-4" /><span>AI-Powered Platform</span>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 mb-4">
            CIG Event <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Media Vault</span>
          </h1>
          <p className="text-lg text-gray-500 mb-10">Upload, organize, and discover campus memories.</p>

          <div {...getRootProps()} className={`relative overflow-hidden border-2 border-dashed rounded-3xl p-10 transition-all duration-300 ease-in-out cursor-pointer group ${isDragActive ? "border-blue-500 bg-blue-50 scale-105 shadow-lg" : "border-gray-300 bg-gray-50 hover:bg-gray-100"}`}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center space-y-4 z-10 relative">
              <div className="bg-white p-4 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                {uploading ? <Loader2 className="h-8 w-8 text-blue-600 animate-spin" /> : <UploadCloud className="h-8 w-8 text-blue-500" />}
              </div>
              <div className="text-lg font-semibold text-gray-700">{isDragActive ? "Drop the magic here!" : "Drag & drop new event media"}</div>
            </div>
          </div>
          {message && <div className="mt-6 inline-block bg-green-100 text-green-700 px-6 py-3 rounded-full font-semibold shadow-sm">{message}</div>}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {/* 🔥 THE NEW SEARCH BAR */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <h2 className="text-2xl font-bold text-gray-800">Recent Highlights</h2>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by tags (e.g. #Person) or user..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            />
          </div>
          <div className="text-sm text-gray-500 font-medium whitespace-nowrap">{filteredGallery.length} Media Files</div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredGallery.map((media) => {
            const isLiked = media.interactions.some((i: any) => i.userId === MY_USER_ID && i.type === 'LIKE');
            const hasMyFace = media.facesInPhoto?.includes(MY_USER_ID);

            return (
              <div key={media.id} className="group relative bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col border border-gray-100">
                <div className="h-72 w-full overflow-hidden relative bg-gray-100">
                  <img src={media.s3Url} alt="Media" className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-700 ease-in-out" />
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    {hasMyFace && <div className="bg-green-500/90 text-white text-xs px-3 py-1.5 rounded-full font-bold flex items-center shadow-lg"><UserCheck className="w-3 h-3 mr-1.5" /> You're in this!</div>}
                  </div>
                </div>

                <div className="p-6 flex-grow flex flex-col bg-white z-10">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">By {media.uploader?.name}</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-6 flex-grow">
                    {media.tags?.map((tag: string, idx: number) => (
                      <span key={idx} className="bg-gray-100 text-gray-600 text-[11px] px-3 py-1 rounded-full font-medium">#{tag}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex space-x-5">
                      <button onClick={() => handleLike(media.id)} className="flex items-center text-gray-400 hover:text-red-500 transition-colors">
                        <Heart className={`w-5 h-5 mr-1.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                        <span className={`text-sm font-semibold ${isLiked ? 'text-red-500' : ''}`}>{media.interactions.filter((i: any) => i.type === 'LIKE').length}</span>
                      </button>
                    </div>

                    <a 
                      href={`${API_URL}/api/media/download/${media.id}?userId=${MY_USER_ID}`}
                      className="flex items-center bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-600 transition-all duration-300"
                    >
                      <Download className="w-4 h-4 mr-1.5" /> Download
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}