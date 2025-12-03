import React, { memo } from 'react';
import { motion } from 'framer-motion';

const BingoCard = memo(({ card, calledNumbers, compact = false }) => {
  const isNumberCalled = (cell) => {
    if (cell.free) return true;
    return calledNumbers?.some(n => 
      n.letter === cell.letter && n.number === cell.number
    ) || cell.called;
  };

  const columns = ['B', 'I', 'N', 'G', 'O'];

  return (
    <div className={`bg-gray-900 rounded-xl overflow-hidden ${
      compact ? 'p-3' : 'p-4'
    }`}>
      {/* Card Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="font-bold text-sm">#{card.number}</span>
          </div>
          <h3 className={`font-bold ${compact ? 'text-sm' : 'text-lg'}`}>
            Bingo Card
          </h3>
        </div>
        <div className={`bg-gray-800 px-3 py-1 rounded-full ${
          compact ? 'text-xs' : 'text-sm'
        }`}>
          {card.owner ? 'Owned' : 'Available'}
        </div>
      </div>

      {/* Card Grid */}
      <div className="relative">
        {/* Column Headers */}
        <div className="grid grid-cols-5 gap-1 mb-1">
          {columns.map((letter, colIndex) => (
            <div
              key={letter}
              className="text-center py-2 bg-gray-800 rounded-t-lg font-bold"
            >
              {letter}
            </div>
          ))}
        </div>

        {/* Number Grid */}
        <div className="grid grid-cols-5 gap-1">
          {card.numbers.map((row, rowIndex) => (
            <React.Fragment key={rowIndex}>
              {row.map((cell, colIndex) => {
                const isCalled = isNumberCalled(cell);
                const isFree = cell.free;
                
                return (
                  <motion.div
                    key={`${rowIndex}-${colIndex}`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`
                      aspect-square flex items-center justify-center rounded-lg
                      ${compact ? 'text-sm' : 'text-lg font-semibold'}
                      ${isFree 
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600' 
                        : isCalled 
                          ? 'bg-gradient-to-br from-green-600 to-emerald-600' 
                          : 'bg-gray-800 hover:bg-gray-700'
                      }
                      ${rowIndex === 2 && colIndex === 2 ? 'relative' : ''}
                      transition-all duration-200
                    `}
                  >
                    {isFree ? (
                      <div className="text-center">
                        <div className="text-xs">FREE</div>
                        <div className="text-[10px] opacity-75">SPACE</div>
                      </div>
                    ) : (
                      <>
                        <div className={`${compact ? 'text-xs' : ''}`}>
                          {cell.number}
                        </div>
                        {isCalled && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center"
                          >
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                              <div className="w-4 h-4 rounded-full bg-white"></div>
                            </div>
                          </motion.div>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Marked: {
              card.numbers.flat().filter(cell => isNumberCalled(cell)).length
            }/25</span>
            <span>{Math.round(
              (card.numbers.flat().filter(cell => isNumberCalled(cell)).length / 25) * 100
            )}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ 
                width: `${(card.numbers.flat().filter(cell => isNumberCalled(cell)).length / 25) * 100}%` 
              }}
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Card Footer */}
      {!compact && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex justify-between text-sm">
            <div className="text-gray-400">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Marked</span>
              </div>
            </div>
            <div className="text-gray-400">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>Available</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

BingoCard.displayName = 'BingoCard';

export default BingoCard;
