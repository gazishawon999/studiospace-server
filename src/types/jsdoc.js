/**
 * @typedef {Object} StudioDocument
 * @property {import('mongodb').ObjectId} [_id]
 * @property {string} title
 * @property {"Photo Studio" | "Sound Stage" | "Podcast Lounge" | "Music Suite" | "Art Workshop"} category
 * @property {number} hourlyRate
 * @property {number} securityDeposit
 * @property {number} maxCapacity
 * @property {string} location
 * @property {string} imageUrl
 * @property {string[]} galleryImages
 * @property {string[]} amenities
 * @property {string} overview
 * @property {number} rating
 * @property {number} reviewCount
 * @property {string} ownerName
 * @property {string} ownerEmail
 * @property {string} [ownerPhoto]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} BookingDocument
 * @property {import('mongodb').ObjectId} [_id]
 * @property {string} studioId
 * @property {string} studioTitle
 * @property {string} studioImage
 * @property {string} studioCategory
 * @property {string} studioLocation
 * @property {number} hourlyRate
 * @property {number} securityDeposit
 * @property {string} ownerEmail
 * @property {string} userEmail
 * @property {string} userName
 * @property {string} bookingDate - Format: "YYYY-MM-DD"
 * @property {number} startTime - 24h integer (e.g. 9 for 09:00)
 * @property {number} endTime - 24h integer (e.g. 14 for 14:00)
 * @property {number} totalHours
 * @property {number} totalPrice
 * @property {string} [projectNotes]
 * @property {"Pending" | "Confirmed" | "Completed" | "Cancelled"} status
 * @property {string} createdAt
 */

export {};
