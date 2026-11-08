const maxImageSizeBytes = 512 * 1024;
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function readImageFile(file: File): Promise<string> {
  if (!supportedImageTypes.has(file.type)) {
    return Promise.reject(new Error("Choose a JPG, PNG, or WebP image."));
  }
  if (file.size > maxImageSizeBytes) {
    return Promise.reject(new Error("Choose an image smaller than 512 KB."));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected image could not be read."));
    };
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}
