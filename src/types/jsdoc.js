/**
 * @typedef {Object} StudioDocument
 * @property {import('mongodb').ObjectId} [_id]
 * @property {string} title
 * @property {"Photo Studio" | "Film Stage" | "Sound Stage" | "Podcast Lounge" | "Music Suite" | "Workshop" | "Art Workshop" | string} category
 * @property {number} hourlyRate
 * @property {number} securityDeposit
 * @property {number} maxCapacity
 * @property {string} location
 * @property {string} imageUrl
 * @property {string[]} [galleryImages]
 * @property {string[]} amenities
 * @property {string} overview
 * @property {import('mongodb').ObjectId|string} [ownerId]
 * @property {string} ownerName
 * @property {string} ownerEmail
 * @property {string} [ownerPhoto]
 * @property {number} [rating]
 * @property {number} [reviewCount]
 * @property {Date|string} createdAt
 * @property {Date|string} updatedAt
 */

/**
 * @typedef {Object} BookingDocument
 * @property {import('mongodb').ObjectId} [_id]
 * @property {string} studioId
 * @property {string} studioTitle
 * @property {string} studioImage
 * @property {string} [studioCategory]
 * @property {string} [studioLocation]
 * @property {string} userId
 * @property {string} userName
 * @property {string} userEmail
 * @property {string} bookingDate - Format: "YYYY-MM-DD"
 * @property {number} startTime - 24h integer hour (0-23)
 * @property {number} endTime - 24h integer hour (1-24, exclusive)
 * @property {number} duration
 * @property {number} hourlyRate
 * @property {number} bookingPrice
 * @property {number} securityDeposit
 * @property {"Pending" | "Confirmed" | "Completed" | "Cancelled"} status
 * @property {Date|string} createdAt
 * @property {Date|string} updatedAt
 */

export {};
