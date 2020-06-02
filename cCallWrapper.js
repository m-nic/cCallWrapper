export class cCallWrapper {
    _heapMap = {
        HEAP8: Int8Array, // int8_t
        HEAPU8: Uint8Array, // uint8_t
        HEAP16: Int16Array, // int16_t
        HEAPU16: Uint16Array, // uint16_t
        HEAP32: Int32Array, // int32_t
        HEAPU32: Uint32Array, // uint32_t
        HEAPF32: Float32Array, // float
        HEAPF64: Float64Array, // double
    };

    static of(fn) {
        return new cCallWrapper(fn);
    }

    constructor(fn) {
        this._fn = fn;
    }

    setReturnType(returnType, heapType = 'HEAPF32', returnSize = 1) {
        this._returnType = returnType;
        this._returnHeap = heapType;
        this._returnSize = returnSize;

        return this;
    }

    setParamTypes(paramTypes, paramHeaps = null) {

        this._paramTypes = paramTypes;
        this._paramHeaps = paramHeaps;

        return this;
    }

    _setHeap(typedArray, buf, heapType = 'HEAPF32') {
        switch (heapType) {
            case 'HEAP8':
            case 'HEAPU8':
                Module[heapType].set(typedArray, buf);
                break;
            case 'HEAP16':
            case 'HEAPU16':
                Module[heapType].set(typedArray, buf >> 1);
                break;
            case 'HEAP32':
            case 'HEAPU32':
            case 'HEAPF32':
                Module[heapType].set(typedArray, buf >> 2);
                break;
            case 'HEAPF64':
                Module[heapType].set(typedArray, buf >> 3);
                break
        }
    }

    _copyToTypedArray(param, heapType) {
        const typedArray = new this._heapMap[heapType](param.length);

        for (let i = 0; i < param.length; i++) {
            typedArray[i] = param[i]
        }

        return typedArray;
    }

    _prepareParams(args = []) {

        let params = [];
        let paramTypes = [];

        let returnType = this._returnType === 'array' ? 'number' : this._returnType;

        this.bufferList = [];

        for (let i = 0; i < args.length; i++) {

            if (this._paramTypes[i] === 'array') {
                const typedArray = this._copyToTypedArray();
                const buf = Module._malloc(typedArray.length * typedArray.BYTES_PER_ELEMENT);

                this._setHeap(typedArray, buf, this._paramHeaps[i]);

                this.bufferList.push(buf);

                params.push(buf);
                params.push(args[i].length);

                paramTypes.push('number');
                paramTypes.push('number');
            } else {
                params.push(args[i]);
                paramTypes.push(!this._paramTypes[i] ? 'number' : this._paramTypes[i])
            }
        }

        return {
            params,
            paramTypes,
            returnType
        };
    }

    _clearBuffer() {
        for (let i = 0; i < this.bufferList.length; i++) {
            Module._free(this.bufferList[i]);
        }
    }

    _returnResp(response) {
        if (this._returnType === 'array') {
            const returnData = [];

            const offset = response / this._heapMap[this._returnHeap].BYTES_PER_ELEMENT;

            for (let i = 0; i < this._returnSize; i++) {
                returnData.push(
                    Module[this._returnHeap][offset + i]
                )
            }

            return returnData;
        } else {
            return response;
        }
    }

    make() {
        return (...args) => {
            let response;
            let error;

            try {
                let {params, paramTypes, returnType} = this._prepareParams(args);

                response = Module.ccall(this._fn, returnType, paramTypes, params)
            } catch (e) {
                error = e
            } finally {
                this._clearBuffer();
            }

            if (error) {
                throw error;
            }

            return this._returnResp(response);
        };
    }
}
